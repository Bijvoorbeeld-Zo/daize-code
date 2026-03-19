import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";

import { isElectron } from "../env";
import {
  linearConnectionQueryOptions,
  linearIssuesQueryOptions,
  linearQueryKeys,
} from "../lib/linearReactQuery";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";

function TasksLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={`task-skeleton-${index}`}
          className="grid grid-cols-[90px_minmax(0,1fr)_120px] items-center gap-4 rounded-lg border border-border px-3 py-3"
        >
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="ml-auto h-4 w-20 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function TasksRouteView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const linearConnectionQuery = useQuery(linearConnectionQueryOptions());
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
                    Synced {linearIssuesQuery.data.syncedAt}
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {linearIssuesQuery.data.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="grid grid-cols-[90px_minmax(0,1fr)_120px] items-center gap-4 px-4 py-3"
                    >
                      <span className="text-xs font-medium text-foreground/80">
                        {issue.identifier}
                      </span>
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {issue.title}
                      </span>
                      <span className="justify-self-end text-xs text-muted-foreground">
                        {issue.status.name}
                      </span>
                    </div>
                  ))}
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
