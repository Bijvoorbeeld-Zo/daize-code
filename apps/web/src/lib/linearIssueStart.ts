import type { LinearIssueSummary } from "@daize/contracts";

import type { Project } from "~/types";

export function findLinkedProjectForLinearIssue(
  projects: readonly Project[],
  issue: LinearIssueSummary,
): Project | null {
  const linearProjectId = issue.project?.id ?? null;
  if (!linearProjectId) {
    return null;
  }

  return projects.find((project) => project.linearProjectId === linearProjectId) ?? null;
}

export function buildLinearIssueStartPrompt(input: { issue: LinearIssueSummary }): string {
  const { issue } = input;

  return `Implement Linear issue ${issue.identifier}: ${issue.title}`;
}
