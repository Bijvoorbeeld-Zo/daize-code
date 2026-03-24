import type { LinearIssueSummary } from "@daize/contracts";

export const TASKS_PROJECT_FILTER_ALL = "all";
export const TASKS_PROJECT_FILTER_NO_PROJECT = "no-project";

export interface TasksRouteSearch {
  project?: string | undefined;
}

export interface TasksProjectFilterOption {
  count: number;
  label: string;
  value: string;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function parseTasksRouteSearch(search: Record<string, unknown>): TasksRouteSearch {
  return {
    project: normalizeSearchString(search.project),
  };
}

export function getTasksProjectFilterOptions(
  issues: readonly LinearIssueSummary[],
): TasksProjectFilterOption[] {
  const countsByProjectId = new Map<string, number>();
  const projectNameById = new Map<string, string>();
  let noProjectCount = 0;

  for (const issue of issues) {
    const projectId = issue.project?.id;
    if (projectId) {
      countsByProjectId.set(projectId, (countsByProjectId.get(projectId) ?? 0) + 1);
      projectNameById.set(projectId, issue.project?.name ?? "Unknown project");
      continue;
    }

    noProjectCount += 1;
  }

  const options: TasksProjectFilterOption[] = [
    {
      count: issues.length,
      label: "All projects",
      value: TASKS_PROJECT_FILTER_ALL,
    },
  ];

  for (const [projectId, count] of countsByProjectId.entries()) {
    options.push({
      count,
      label: projectNameById.get(projectId) ?? "Unknown project",
      value: projectId,
    });
  }

  options.sort((left, right) => {
    if (left.value === TASKS_PROJECT_FILTER_ALL) return -1;
    if (right.value === TASKS_PROJECT_FILTER_ALL) return 1;
    return left.label.localeCompare(right.label);
  });

  if (noProjectCount > 0) {
    options.push({
      count: noProjectCount,
      label: "No project",
      value: TASKS_PROJECT_FILTER_NO_PROJECT,
    });
  }

  return options;
}

export function resolveTasksProjectFilter(
  projectFilter: string | undefined,
  options: readonly TasksProjectFilterOption[],
): string {
  if (!projectFilter) {
    return TASKS_PROJECT_FILTER_ALL;
  }

  return options.some((option) => option.value === projectFilter)
    ? projectFilter
    : TASKS_PROJECT_FILTER_ALL;
}

export function filterLinearIssuesByProject(
  issues: readonly LinearIssueSummary[],
  projectFilter: string,
): LinearIssueSummary[] {
  if (projectFilter === TASKS_PROJECT_FILTER_ALL) {
    return [...issues];
  }

  return issues.filter((issue) => {
    if (projectFilter === TASKS_PROJECT_FILTER_NO_PROJECT) {
      return issue.project === null;
    }

    return issue.project?.id === projectFilter;
  });
}
