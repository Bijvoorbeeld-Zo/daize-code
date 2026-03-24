import { BlocksIcon, PlusIcon, RefreshCwIcon, SquareArrowOutUpRightIcon } from "lucide-react";
import { useDeferredValue, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import type { InstalledSkill, RecommendedSkill, SearchSkill } from "@daize/contracts";
import { isElectron } from "../env";
import { openInPreferredEditor } from "../editorPreferences";
import {
  installSearchSkillMutationOptions,
  installSkillMutationOptions,
  skillsListQueryOptions,
  skillsQueryKeys,
  skillsSearchQueryOptions,
} from "../lib/skillsReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { Skeleton } from "../components/ui/skeleton";
import { toastManager } from "../components/ui/toast";
import { cn } from "../lib/utils";
import {
  ClaudeAI,
  Gemini,
  GitHubIcon,
  MicrosoftIcon,
  OpenAI,
  VercelIcon,
} from "../components/Icons";

function matchesSkillQuery(
  skill: Pick<InstalledSkill | RecommendedSkill, "name" | "description" | "slug">,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return [skill.name, skill.description, skill.slug].some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

function sourceLabel(source: InstalledSkill["source"]): string {
  return source === "user" ? "Custom" : "Bundled";
}

function InstalledAgentIcons({ installedFor }: { installedFor: InstalledSkill["installedFor"] }) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {installedFor.includes("codex") ? <OpenAI className="size-3.5" /> : null}
      {installedFor.includes("claude-code") ? <ClaudeAI className="size-3.5" /> : null}
    </div>
  );
}

function skillOriginIcon(originLabel: string | undefined) {
  const normalized = originLabel?.trim().toLowerCase();
  if (!normalized) {
    return BlocksIcon;
  }
  if (normalized.includes("anthropic") || normalized.includes("claude")) {
    return ClaudeAI;
  }
  if (normalized.includes("openai") || normalized.includes("codex")) {
    return OpenAI;
  }
  if (normalized.includes("vercel")) {
    return VercelIcon;
  }
  if (normalized.includes("microsoft") || normalized.includes("azure")) {
    return MicrosoftIcon;
  }
  if (normalized.includes("github")) {
    return GitHubIcon;
  }
  if (normalized.includes("google") || normalized.includes("gemini")) {
    return Gemini;
  }

  return BlocksIcon;
}

function SkillsSectionSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={`skills-skeleton-${index}`}
          className="flex items-start gap-3 rounded-xl border border-border px-4 py-4"
        >
          <Skeleton className="size-10 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 rounded-sm" />
            <Skeleton className="h-4 w-full rounded-sm" />
          </div>
          <Skeleton className="mt-1 h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function SkillsSection({
  title,
  emptyLabel,
  emptyInline = false,
  children,
}: {
  title: string;
  emptyLabel: string;
  emptyInline?: boolean;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      {hasChildren ? (
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      ) : emptyInline ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function SkillCard({
  name,
  description,
  badge,
  installedFor,
  originLabel,
  action,
  active = false,
}: {
  name: string;
  description: string;
  badge?: string;
  installedFor?: InstalledSkill["installedFor"];
  originLabel?: string | undefined;
  action: React.ReactNode;
  active?: boolean;
}) {
  const SourceIcon = skillOriginIcon(originLabel);

  return (
    <article
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card px-4 py-4",
        active && "bg-muted/35",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <SourceIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {badge ? (
            <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {badge}
            </span>
          ) : null}
          {installedFor ? <InstalledAgentIcons installedFor={installedFor} /> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </article>
  );
}

function SearchResultRow({
  skill,
  disabled,
  onInstall,
}: {
  skill: SearchSkill;
  disabled: boolean;
  onInstall: (skill: SearchSkill) => void;
}) {
  const SourceIcon = skillOriginIcon(skill.originLabel);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <SourceIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{skill.installRef}</p>
          {skill.installsLabel ? (
            <span className="text-[11px] text-muted-foreground">{skill.installsLabel}</span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{skill.url}</p>
      </div>
      <Button size="xs" onClick={() => onInstall(skill)} disabled={disabled}>
        <PlusIcon className="size-4" />
        Add
      </Button>
    </div>
  );
}

function SkillsRouteView() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery(skillsListQueryOptions());
  const installSkillMutation = useMutation(installSkillMutationOptions({ queryClient }));
  const installSearchSkillMutation = useMutation(
    installSearchSkillMutationOptions({ queryClient }),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [addSkillDialogOpen, setAddSkillDialogOpen] = useState(false);
  const [addSkillQuery, setAddSkillQuery] = useState("");
  const deferredAddSkillQuery = useDeferredValue(addSkillQuery.trim());
  const searchSkillsQuery = useQuery({
    ...skillsSearchQueryOptions(deferredAddSkillQuery),
    enabled: addSkillDialogOpen && deferredAddSkillQuery.length >= 2,
  });

  const installedSkills =
    skillsQuery.data?.installedSkills.filter((skill) => matchesSkillQuery(skill, searchQuery)) ??
    [];
  const recommendedSkills =
    skillsQuery.data?.recommendedSkills.filter((skill) => matchesSkillQuery(skill, searchQuery)) ??
    [];

  const handleRefresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
  };

  const handleOpenSkill = async (skill: InstalledSkill): Promise<void> => {
    try {
      await openInPreferredEditor(ensureNativeApi(), skill.path);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open skill",
        description:
          error instanceof Error ? error.message : `Unable to open ${skill.name} in your editor.`,
      });
    }
  };

  const handleInstallSkill = async (skill: RecommendedSkill): Promise<void> => {
    try {
      const result = await installSkillMutation.mutateAsync(skill.slug);
      toastManager.add({
        type: "success",
        title: result.created ? "Skill installed" : "Skill already installed",
        description: `${result.skill.name} is now available in your custom skills folder.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not install skill",
        description:
          error instanceof Error ? error.message : `Unable to install ${skill.name} right now.`,
      });
    }
  };

  const handleInstallSearchSkill = async (skill: SearchSkill): Promise<void> => {
    try {
      const result = await installSearchSkillMutation.mutateAsync({
        installRef: skill.installRef,
        slug: skill.slug,
      });
      toastManager.add({
        type: "success",
        title: result.created ? "Skill installed" : "Skill already installed",
        description: `${result.skill.name} is now available in your installed skills.`,
      });
      setAddSkillDialogOpen(false);
      setAddSkillQuery("");
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not install skill",
        description:
          error instanceof Error
            ? error.message
            : `Unable to install ${skill.installRef} right now.`,
      });
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Skills</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Skills
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Skills</p>
                <p className="text-xs text-muted-foreground">
                  View bundled skills, keep custom ones editable, and create new skill scaffolds.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search skills"
                  className="h-8 w-[220px]"
                />
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void handleRefresh()}
                  disabled={skillsQuery.isLoading}
                >
                  <RefreshCwIcon className="size-4" />
                  Refresh
                </Button>
                <Button size="xs" onClick={() => setAddSkillDialogOpen(true)}>
                  <PlusIcon className="size-4" />
                  Add skill
                </Button>
              </div>
            </header>

            {skillsQuery.isLoading ? <SkillsSectionSkeleton /> : null}

            {skillsQuery.error ? (
              <Alert variant="error">
                <AlertTitle>Unable to load skills</AlertTitle>
                <AlertDescription>
                  {skillsQuery.error instanceof Error
                    ? skillsQuery.error.message
                    : "The skills catalog could not be loaded right now."}
                </AlertDescription>
              </Alert>
            ) : null}

            {!skillsQuery.isLoading && !skillsQuery.error ? (
              <>
                <SkillsSection
                  title={`Installed (${installedSkills.length})`}
                  emptyLabel={
                    searchQuery.trim().length > 0
                      ? "No installed skills match this search."
                      : "No installed skills were found in your local skill folders."
                  }
                >
                  {installedSkills.map((skill) => (
                    <SkillCard
                      key={skill.slug}
                      name={skill.name}
                      description={skill.description}
                      badge={sourceLabel(skill.source)}
                      installedFor={skill.installedFor}
                      originLabel={skill.originLabel}
                      action={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Open ${skill.name}`}
                          onClick={() => void handleOpenSkill(skill)}
                        >
                          <SquareArrowOutUpRightIcon className="size-4" />
                        </Button>
                      }
                      active={skill.source === "bundled"}
                    />
                  ))}
                </SkillsSection>

                <SkillsSection
                  title={`Trending (${recommendedSkills.length})`}
                  emptyInline={
                    Boolean(skillsQuery.data?.trendingError) && searchQuery.trim().length === 0
                  }
                  emptyLabel={
                    skillsQuery.data?.trendingError && searchQuery.trim().length === 0
                      ? "Kon trending skills niet vinden."
                      : searchQuery.trim().length > 0
                        ? "No trending skills match this search."
                        : "No trending skills are available right now."
                  }
                >
                  {recommendedSkills.map((skill) => (
                    <SkillCard
                      key={skill.slug}
                      name={skill.name}
                      description={skill.description}
                      originLabel={skill.originLabel}
                      action={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Install ${skill.name}`}
                          disabled={installSkillMutation.isPending}
                          onClick={() => void handleInstallSkill(skill)}
                        >
                          <PlusIcon className="size-4" />
                        </Button>
                      }
                    />
                  ))}
                </SkillsSection>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={addSkillDialogOpen} onOpenChange={setAddSkillDialogOpen}>
        <DialogPopup className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add skill</DialogTitle>
            <DialogDescription>
              Search the skills registry and install a skill into your Codex and Claude Code skills
              directories.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Input
              type="search"
              value={addSkillQuery}
              onChange={(event) => setAddSkillQuery(event.target.value)}
              placeholder="Search for skills"
              className="h-9"
              autoFocus
            />

            {deferredAddSkillQuery.length < 2 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Type at least 2 characters to search.
              </div>
            ) : null}

            {searchSkillsQuery.isLoading ? <SkillsSectionSkeleton /> : null}

            {searchSkillsQuery.error ? (
              <Alert variant="error">
                <AlertTitle>Unable to search skills</AlertTitle>
                <AlertDescription>
                  {searchSkillsQuery.error instanceof Error
                    ? searchSkillsQuery.error.message
                    : "The skills registry could not be searched right now."}
                </AlertDescription>
              </Alert>
            ) : null}

            {deferredAddSkillQuery.length >= 2 &&
            !searchSkillsQuery.isLoading &&
            !searchSkillsQuery.error ? (
              searchSkillsQuery.data?.skills.length ? (
                <div className="space-y-3">
                  {searchSkillsQuery.data.skills.map((skill) => (
                    <SearchResultRow
                      key={`${skill.installRef}-${skill.slug}`}
                      skill={skill}
                      disabled={installSearchSkillMutation.isPending}
                      onInstall={handleInstallSearchSkill}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No skills found for this search.
                </div>
              )
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSkillDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/skills")({
  component: SkillsRouteView,
});
