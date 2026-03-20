import type { LinearIssueSummary } from "@daize/contracts";
import { describe, expect, it } from "vitest";

import type { Project } from "~/types";

import { buildLinearIssueStartPrompt, findLinkedProjectForLinearIssue } from "./linearIssueStart";

const issue: LinearIssueSummary = {
  id: "issue-1",
  identifier: "DAI-28",
  title: "Auto label",
  project: {
    id: "linear-project-1",
    name: "Daize Chat",
    icon: null,
  },
  status: {
    name: "In Review",
    color: null,
  },
  assigneeName: "Jane Doe",
};

const linkedProject: Project = {
  id: "project-1" as Project["id"],
  name: "server",
  cwd: "/workspace/server",
  model: "gpt-5",
  expanded: true,
  linearProjectId: "linear-project-1",
  scripts: [],
};

describe("findLinkedProjectForLinearIssue", () => {
  it("returns the project linked to the issue's Linear project", () => {
    expect(findLinkedProjectForLinearIssue([linkedProject], issue)).toEqual(linkedProject);
  });

  it("returns null when the issue has no linked project", () => {
    expect(findLinkedProjectForLinearIssue([], issue)).toBeNull();
  });
});

describe("buildLinearIssueStartPrompt", () => {
  it("includes issue and workspace context", () => {
    const prompt = buildLinearIssueStartPrompt({ issue, linkedProject });

    expect(prompt).toContain("Implement Linear issue DAI-28: Auto label");
    expect(prompt).toContain("- Target Daize Code project: server");
    expect(prompt).toContain("- Workspace path: /workspace/server");
    expect(prompt).toContain("- Run bun fmt, bun lint, and bun typecheck before finishing.");
  });
});
