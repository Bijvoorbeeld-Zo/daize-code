import { describe, expect, it } from "vitest";

import { splitPromptIntoComposerSegments } from "./composer-editor-mentions";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

describe("splitPromptIntoComposerSegments", () => {
  const installedSkills = [
    {
      slug: "frontend-design",
      name: "Frontend Design",
      description: "Create distinctive, production-grade frontend interfaces.",
      path: "/tmp/frontend-design/SKILL.md",
      source: "user",
      installedFor: ["codex"],
    },
  ] as const;

  it("splits mention tokens followed by whitespace into mention segments", () => {
    expect(splitPromptIntoComposerSegments("Inspect @AGENTS.md please")).toEqual([
      { type: "text", text: "Inspect " },
      { type: "mention", path: "AGENTS.md" },
      { type: "text", text: " please" },
    ]);
  });

  it("does not convert an incomplete trailing mention token", () => {
    expect(splitPromptIntoComposerSegments("Inspect @AGENTS.md")).toEqual([
      { type: "text", text: "Inspect @AGENTS.md" },
    ]);
  });

  it("keeps newlines around mention tokens", () => {
    expect(splitPromptIntoComposerSegments("one\n@src/index.ts \ntwo")).toEqual([
      { type: "text", text: "one\n" },
      { type: "mention", path: "src/index.ts" },
      { type: "text", text: " \ntwo" },
    ]);
  });

  it("keeps inline terminal context placeholders at their prompt positions", () => {
    expect(
      splitPromptIntoComposerSegments(
        `Inspect ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}@AGENTS.md please`,
      ),
    ).toEqual([
      { type: "text", text: "Inspect " },
      { type: "terminal-context", context: null },
      { type: "mention", path: "AGENTS.md" },
      { type: "text", text: " please" },
    ]);
  });

  it("splits installed skill tokens into skill segments", () => {
    expect(
      splitPromptIntoComposerSegments("Gebruik $frontend-design nu", [], installedSkills),
    ).toEqual([
      { type: "text", text: "Gebruik " },
      { type: "skill", slug: "frontend-design", skill: installedSkills[0] },
      { type: "text", text: " nu" },
    ]);
  });

  it("does not convert an incomplete trailing skill token", () => {
    expect(
      splitPromptIntoComposerSegments("Gebruik $frontend-design", [], installedSkills),
    ).toEqual([{ type: "text", text: "Gebruik $frontend-design" }]);
  });
});
