import type { LinearIssueSummary } from "@daize/contracts";
import { describe, expect, it } from "vitest";

import {
  filterLinearIssuesByProject,
  getTasksProjectFilterOptions,
  parseTasksRouteSearch,
  resolveTasksProjectFilter,
  TASKS_PROJECT_FILTER_ALL,
  TASKS_PROJECT_FILTER_NO_PROJECT,
} from "./tasksProjectFilter";

const issues: LinearIssueSummary[] = [
  {
    id: "issue-1",
    identifier: "DAI-1",
    title: "Alpha task",
    project: { id: "linear-alpha", name: "Linear Alpha", icon: null },
    status: { name: "Todo", color: null },
    assigneeName: "Jorn",
  },
  {
    id: "issue-2",
    identifier: "DAI-2",
    title: "Second alpha task",
    project: { id: "linear-alpha", name: "Linear Alpha", icon: null },
    status: { name: "Todo", color: null },
    assigneeName: "Jorn",
  },
  {
    id: "issue-3",
    identifier: "DAI-3",
    title: "Beta task",
    project: { id: "linear-beta", name: "Linear Beta", icon: null },
    status: { name: "In Progress", color: null },
    assigneeName: "Jorn",
  },
  {
    id: "issue-4",
    identifier: "DAI-4",
    title: "No-project task",
    project: null,
    status: { name: "In Progress", color: null },
    assigneeName: "Jorn",
  },
];

describe("parseTasksRouteSearch", () => {
  it("reads the project filter from route search", () => {
    expect(parseTasksRouteSearch({ project: "linear-alpha" })).toEqual({
      project: "linear-alpha",
    });
  });

  it("drops blank or invalid project filters", () => {
    expect(parseTasksRouteSearch({ project: "   " })).toEqual({ project: undefined });
    expect(parseTasksRouteSearch({ project: 1 })).toEqual({ project: undefined });
  });
});

describe("getTasksProjectFilterOptions", () => {
  it("builds project filter options from Linear issue projects", () => {
    expect(getTasksProjectFilterOptions(issues)).toEqual([
      { count: 4, label: "All projects", value: TASKS_PROJECT_FILTER_ALL },
      { count: 2, label: "Linear Alpha", value: "linear-alpha" },
      { count: 1, label: "Linear Beta", value: "linear-beta" },
      { count: 1, label: "No project", value: TASKS_PROJECT_FILTER_NO_PROJECT },
    ]);
  });
});

describe("resolveTasksProjectFilter", () => {
  it("falls back to all for unknown filters", () => {
    const options = getTasksProjectFilterOptions(issues);

    expect(resolveTasksProjectFilter("missing", options)).toBe(TASKS_PROJECT_FILTER_ALL);
    expect(resolveTasksProjectFilter(undefined, options)).toBe(TASKS_PROJECT_FILTER_ALL);
  });
});

describe("filterLinearIssuesByProject", () => {
  it("filters issues to a Linear project", () => {
    expect(filterLinearIssuesByProject(issues, "linear-alpha").map((issue) => issue.id)).toEqual([
      "issue-1",
      "issue-2",
    ]);
  });

  it("filters issues with no Linear project", () => {
    expect(
      filterLinearIssuesByProject(issues, TASKS_PROJECT_FILTER_NO_PROJECT).map((issue) => issue.id),
    ).toEqual(["issue-4"]);
  });

  it("returns all issues for the all-projects filter", () => {
    expect(
      filterLinearIssuesByProject(issues, TASKS_PROJECT_FILTER_ALL).map((issue) => issue.id),
    ).toEqual(["issue-1", "issue-2", "issue-3", "issue-4"]);
  });
});
