import { useEffect, useMemo, useState } from "react";
import { DEFAULT_RUNTIME_MODE, type ThreadId } from "@daize/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { PlayIcon, RefreshCwIcon } from "lucide-react";

import { resolveTaskStartModelSelection, useAppSettings } from "../appSettings";
import { isElectron } from "../env";
import {
  linearConnectionQueryOptions,
  linearIssuesQueryOptions,
  linearQueryKeys,
} from "../lib/linearReactQuery";
import { serverConfigQueryOptions, serverQueryKeys } from "../lib/serverReactQuery";
import { useStore } from "../store";
import { formatTimestamp } from "../timestampFormat";
import { truncateTitle } from "../truncateTitle";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { toastManager } from "../components/ui/toast";
import {
  buildLinearIssueStartPrompt,
  findLinkedProjectForLinearIssue,
} from "../lib/linearIssueStart";
import { cn, newCommandId, newMessageId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";

function TasksLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={`task-skeleton-${index}`}
          className="grid grid-cols-[90px_minmax(0,1fr)_140px_120px] items-center gap-4 rounded-lg border border-border px-3 py-3"
        >
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-24 rounded-sm" />
          <Skeleton className="ml-auto h-4 w-20 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function getLinearStatusClasses(statusName: string): {
  groupDotClassName: string;
  groupTextClassName: string;
  badgeClassName: string;
} {
  const status = statusName.trim().toLowerCase();

  if (
    status.includes("todo") ||
    status.includes("backlog") ||
    status.includes("unstarted") ||
    status.includes("triage")
  ) {
    return {
      groupDotClassName: "bg-zinc-400",
      groupTextClassName: "text-zinc-600",
      badgeClassName: "border-zinc-300 bg-zinc-50 text-zinc-700",
    };
  }

  if (status.includes("review")) {
    return {
      groupDotClassName: "bg-emerald-600",
      groupTextClassName: "text-emerald-700",
      badgeClassName: "border-emerald-300 bg-emerald-50 text-emerald-800",
    };
  }

  if (status.includes("progress") || status.includes("started")) {
    return {
      groupDotClassName: "bg-sky-600",
      groupTextClassName: "text-sky-700",
      badgeClassName: "border-sky-300 bg-sky-50 text-sky-800",
    };
  }

  if (status.includes("done") || status.includes("complete") || status.includes("closed")) {
    return {
      groupDotClassName: "bg-zinc-600",
      groupTextClassName: "text-zinc-700",
      badgeClassName: "border-zinc-300 bg-zinc-100 text-zinc-800",
    };
  }

  if (status.includes("cancel") || status.includes("blocked")) {
    return {
      groupDotClassName: "bg-rose-600",
      groupTextClassName: "text-rose-700",
      badgeClassName: "border-rose-300 bg-rose-50 text-rose-800",
    };
  }

  return {
    groupDotClassName: "bg-slate-500",
    groupTextClassName: "text-slate-700",
    badgeClassName: "border-slate-300 bg-slate-50 text-slate-800",
  };
}

function TasksRouteView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const [startingIssueId, setStartingIssueId] = useState<string | null>(null);
  const [installingLinearMcp, setInstallingLinearMcp] = useState(false);
  const linearConnectionQuery = useQuery(linearConnectionQueryOptions());
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const linearConnection = linearConnectionQuery.data?.connection ?? null;
  const linearIssuesQuery = useQuery({
    ...linearIssuesQueryOptions(),
    enabled: linearConnection?.status === "connected",
  });

  useEffect(() => {
    if (!linearIssuesQuery.error) return;
    if (!(linearIssuesQuery.error instanceof Error)) return;
    if (!linearIssuesQuery.error.message.toLowerCase().includes("reconnect it in settings")) return;

    void queryClient.invalidateQueries({ queryKey: linearQueryKeys.connection() });
  }, [linearIssuesQuery.error, queryClient]);

  const projectNameByLinearProjectId = useMemo(
    () =>
      new Map(
        projects
          .filter((project) => project.linearProjectId !== null)
          .map((project) => [project.linearProjectId, project.name] as const),
      ),
    [projects],
  );
  const codexLinearMcpMissingIssue =
    serverConfigQuery.data?.issues.find((issue) => issue.kind === "codex.linear-mcp-missing") ??
    null;
  const hasCodexLinearMcp = codexLinearMcpMissingIssue === null;
  const groupedIssues = useMemo(() => {
    const issues = linearIssuesQuery.data?.issues ?? [];
    const groups = new Map<
      string,
      {
        statusName: string;
        issues: Array<(typeof issues)[number]>;
      }
    >();

    for (const issue of issues) {
      const existing = groups.get(issue.status.name);
      if (existing) {
        existing.issues.push(issue);
        continue;
      }

      groups.set(issue.status.name, {
        statusName: issue.status.name,
        issues: [issue],
      });
    }

    return Array.from(groups.values());
  }, [linearIssuesQuery.data?.issues]);

  const handleInstallLinearMcp = async (): Promise<void> => {
    const api = readNativeApi();
    if (!api || installingLinearMcp) {
      return;
    }

    setInstallingLinearMcp(true);
    try {
      const result = await api.server.installCodexLinearMcp();
      await queryClient.invalidateQueries({ queryKey: serverQueryKeys.all });
      toastManager.add({
        type: "success",
        title: result.changed ? "Linear MCP installed" : "Linear MCP already configured",
        description: result.authUrl
          ? `Finish the Linear login in the browser Codex opened. If needed, use: ${result.authUrl}`
          : result.configPath,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not install or connect Linear MCP",
        description:
          error instanceof Error ? error.message : "An error occurred while updating Codex config.",
      });
    } finally {
      setInstallingLinearMcp(false);
    }
  };

  const handleStartIssue = async (
    issue: NonNullable<typeof linearIssuesQuery.data>["issues"][number],
  ): Promise<void> => {
    if (!hasCodexLinearMcp) {
      toastManager.add({
        type: "warning",
        title: "Task cannot be started",
        description: "Install and connect the Linear MCP in Codex first.",
      });
      return;
    }

    const linkedProject = findLinkedProjectForLinearIssue(projects, issue);
    if (!linkedProject) {
      toastManager.add({
        type: "warning",
        title: "Task cannot be started",
        description: "Link this Linear project to a Daize project in Settings first.",
      });
      return;
    }

    const api = readNativeApi();
    if (!api || startingIssueId !== null) {
      return;
    }

    const createdAt = new Date().toISOString();
    const threadId = newThreadId();
    const { provider, model } = resolveTaskStartModelSelection({
      selectedModel: settings.taskStartModel,
      projectModel: linkedProject.model,
      customCodexModels: settings.customCodexModels,
      customClaudeModels: settings.customClaudeModels,
    });
    const prompt = buildLinearIssueStartPrompt({ issue, linkedProject });

    setStartingIssueId(issue.id);

    try {
      await api.linear.startIssue({ issueId: issue.id });
      void queryClient.invalidateQueries({ queryKey: linearQueryKeys.all });

      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: linkedProject.id,
        title: truncateTitle(`${issue.identifier} ${issue.title}`),
        model,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
          attachments: [],
        },
        provider,
        model,
        assistantDeliveryMode: settings.enableAssistantStreaming ? "streaming" : "buffered",
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: "default",
        createdAt,
      });

      const snapshot = await api.orchestration.getSnapshot();
      syncServerReadModel(snapshot);
      await navigate({
        to: "/$threadId",
        params: { threadId: threadId as ThreadId },
      });
    } catch (error) {
      await api.orchestration
        .dispatchCommand({
          type: "thread.delete",
          commandId: newCommandId(),
          threadId,
        })
        .catch(() => undefined);

      await api.orchestration
        .getSnapshot()
        .then((snapshot) => {
          syncServerReadModel(snapshot);
        })
        .catch(() => undefined);

      toastManager.add({
        type: "error",
        title: "Could not start task thread",
        description:
          error instanceof Error ? error.message : "An error occurred while starting the task.",
      });
    } finally {
      setStartingIssueId(null);
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Tasks</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Tasks
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">My Linear issues</p>
                <p className="text-xs text-muted-foreground">
                  Open issues assigned to your connected Linear account.
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: linearQueryKeys.all });
                }}
                disabled={
                  linearConnectionQuery.isLoading ||
                  linearIssuesQuery.isLoading ||
                  linearConnection?.status !== "connected"
                }
              >
                <RefreshCwIcon className="size-3.5" />
                Refresh
              </Button>
            </div>

            {linearConnectionQuery.isLoading ? <TasksLoadingState /> : null}

            {codexLinearMcpMissingIssue ? (
              <Alert variant="warning">
                <AlertTitle>Linear MCP missing in Codex</AlertTitle>
                <AlertDescription>
                  <p>{codexLinearMcpMissingIssue.message}</p>
                  <div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void handleInstallLinearMcp()}
                      disabled={installingLinearMcp}
                    >
                      {installingLinearMcp ? "Installing..." : "Install & connect Linear MCP"}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {!linearConnectionQuery.isLoading && linearConnection?.status === "disconnected" ? (
              <Alert>
                <AlertTitle>Connect Linear in Settings</AlertTitle>
                <AlertDescription>
                  <p>Add a Linear personal API key in Settings to load your tasks here.</p>
                  <div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void navigate({ to: "/settings" })}
                    >
                      Open Settings
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {!linearConnectionQuery.isLoading && linearConnection?.status === "invalid" ? (
              <Alert variant="error">
                <AlertTitle>Reconnect Linear</AlertTitle>
                <AlertDescription>
                  <p>
                    {linearConnection.message ??
                      "Your saved Linear API key is no longer valid. Reconnect it in Settings."}
                  </p>
                  <div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void navigate({ to: "/settings" })}
                    >
                      Open Settings
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {!linearConnectionQuery.isLoading && linearConnection?.status === "error" ? (
              <Alert variant="error">
                <AlertTitle>Linear connection is unavailable</AlertTitle>
                <AlertDescription>
                  <p>{linearConnection.message ?? "Refresh failed while checking Linear."}</p>
                  <div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void navigate({ to: "/settings" })}
                    >
                      Open Settings
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {linearConnection?.status === "connected" && linearIssuesQuery.isLoading ? (
              <TasksLoadingState />
            ) : null}

            {linearConnection?.status === "connected" && linearIssuesQuery.error ? (
              <Alert variant="error">
                <AlertTitle>Unable to load Linear issues</AlertTitle>
                <AlertDescription>
                  <p>
                    {linearIssuesQuery.error instanceof Error
                      ? linearIssuesQuery.error.message
                      : "The Linear issue list could not be loaded right now."}
                  </p>
                  <div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void linearIssuesQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {linearConnection?.status === "connected" &&
            linearIssuesQuery.data &&
            linearIssuesQuery.data.issues.length === 0 ? (
              <Alert variant="info">
                <AlertTitle>No open assigned issues</AlertTitle>
                <AlertDescription>
                  <p>Your connected Linear account does not have any open assigned issues.</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {linearConnection?.status === "connected" &&
            linearIssuesQuery.data &&
            linearIssuesQuery.data.issues.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
                  <p className="text-xs font-medium text-foreground">
                    {linearIssuesQuery.data.issues.length} open issue
                    {linearIssuesQuery.data.issues.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Synced{" "}
                    {formatTimestamp(linearIssuesQuery.data.syncedAt, settings.timestampFormat)}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {groupedIssues.map((group) => {
                    const statusClasses = getLinearStatusClasses(group.statusName);

                    return (
                      <section key={group.statusName}>
                        <div className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn("size-2 rounded-full", statusClasses.groupDotClassName)}
                            />
                            <span
                              className={cn(
                                "text-xs font-medium",
                                statusClasses.groupTextClassName,
                              )}
                            >
                              {group.statusName}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {group.issues.length} issue{group.issues.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="divide-y divide-border/70">
                          {group.issues.map((issue) => {
                            const issueStatusClasses = getLinearStatusClasses(issue.status.name);

                            return (
                              <div
                                key={issue.id}
                                className="grid grid-cols-[90px_minmax(0,1fr)_140px_128px_92px] items-center gap-4 px-4 py-3"
                              >
                                <span className="text-xs font-medium text-foreground/80">
                                  {issue.identifier}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">{issue.title}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {issue.project?.name ?? "No Linear project"}
                                  </p>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs text-foreground/80">
                                    {issue.project?.id
                                      ? (projectNameByLinearProjectId.get(issue.project.id) ??
                                        "Not linked")
                                      : "No linked project"}
                                  </p>
                                </div>
                                <div className="justify-self-end">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                                      issueStatusClasses.badgeClassName,
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "size-1.5 rounded-full",
                                        issueStatusClasses.groupDotClassName,
                                      )}
                                    />
                                    {issue.status.name}
                                  </span>
                                </div>
                                <div className="justify-self-end">
                                  <Button
                                    size="icon-xs"
                                    onClick={() => void handleStartIssue(issue)}
                                    disabled={
                                      startingIssueId !== null ||
                                      !hasCodexLinearMcp ||
                                      findLinkedProjectForLinearIssue(projects, issue) === null
                                    }
                                    aria-label={
                                      startingIssueId === issue.id
                                        ? `Starting ${issue.identifier}`
                                        : `Start ${issue.identifier}`
                                    }
                                    title={
                                      !hasCodexLinearMcp
                                        ? "Install and connect the Linear MCP in Codex first"
                                        : findLinkedProjectForLinearIssue(projects, issue) === null
                                          ? "Link this Linear project in Settings first"
                                          : `Start ${issue.identifier}`
                                    }
                                  >
                                    <PlayIcon className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/tasks")({
  component: TasksRouteView,
});
