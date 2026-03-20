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

export function buildLinearIssueStartPrompt(input: {
  issue: LinearIssueSummary;
  linkedProject: Project;
}): string {
  const { issue, linkedProject } = input;

  return [
    `Implement Linear issue ${issue.identifier}: ${issue.title}`,
    "",
    "Context",
    `- Linear project: ${issue.project?.name ?? "Not available"}`,
    `- Status: ${issue.status.name}`,
    `- Assignee: ${issue.assigneeName ?? "Not available"}`,
    `- Target Daize Code project: ${linkedProject.name}`,
    `- Workspace path: ${linkedProject.cwd}`,
    "",
    "Instructions",
    "- Inspect the codebase before changing anything.",
    "- Implement the task end-to-end in the linked workspace.",
    "- Prefer shared logic over one-off fixes.",
    "- Run bun fmt, bun lint, and bun typecheck before finishing.",
    "- Summarize the changes and note any assumptions.",
  ].join("\n");
}
