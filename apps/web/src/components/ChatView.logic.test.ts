import { ThreadId } from "@daize/contracts";
import { describe, expect, it } from "vitest";

import {
  augmentPromptWithSkillInstructions,
  buildExpiredTerminalContextToastCopy,
  deriveComposerSendState,
  filterInstalledSkillsForProvider,
} from "./ChatView.logic";

describe("deriveComposerSendState", () => {
  it("treats expired terminal pills as non-sendable content", () => {
    const state = deriveComposerSendState({
      prompt: "\uFFFC",
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.makeUnsafe("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("");
    expect(state.sendableTerminalContexts).toEqual([]);
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(false);
  });

  it("keeps text sendable while excluding expired terminal pills", () => {
    const state = deriveComposerSendState({
      prompt: `yoo \uFFFC waddup`,
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.makeUnsafe("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("yoo  waddup");
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(true);
  });
});

describe("buildExpiredTerminalContextToastCopy", () => {
  it("formats clear empty-state guidance", () => {
    expect(buildExpiredTerminalContextToastCopy(1, "empty")).toEqual({
      title: "Expired terminal context won't be sent",
      description: "Remove it or re-add it to include terminal output.",
    });
  });

  it("formats omission guidance for sent messages", () => {
    expect(buildExpiredTerminalContextToastCopy(2, "omitted")).toEqual({
      title: "Expired terminal contexts omitted from message",
      description: "Re-add it if you want that terminal output included.",
    });
  });
});

describe("filterInstalledSkillsForProvider", () => {
  const skills = [
    {
      slug: "frontend-design",
      name: "Frontend Design",
      description: "Create polished interfaces.",
      path: "/tmp/frontend-design/SKILL.md",
      source: "user",
      installedFor: ["codex"],
    },
    {
      slug: "linear",
      name: "Linear",
      description: "Use Linear workflows.",
      path: "/tmp/linear/SKILL.md",
      source: "user",
      installedFor: ["claude-code"],
    },
    {
      slug: "shared",
      name: "Shared",
      description: "Works everywhere.",
      path: "/tmp/shared/SKILL.md",
      source: "user",
      installedFor: ["codex", "claude-code"],
    },
  ] as const;

  it("returns only codex-compatible skills for codex", () => {
    expect(filterInstalledSkillsForProvider(skills, "codex").map((skill) => skill.slug)).toEqual([
      "frontend-design",
      "shared",
    ]);
  });

  it("returns only claude-compatible skills for claude", () => {
    expect(
      filterInstalledSkillsForProvider(skills, "claudeAgent").map((skill) => skill.slug),
    ).toEqual(["linear", "shared"]);
  });
});

describe("augmentPromptWithSkillInstructions", () => {
  const skills = [
    {
      slug: "frontend-design",
      name: "Frontend Design",
      description: "Create polished interfaces.",
      path: "/tmp/frontend-design/SKILL.md",
      source: "user",
      installedFor: ["codex"],
    },
    {
      slug: "shadcn",
      name: "Shadcn",
      description: "Use shadcn/ui components.",
      path: "/tmp/shadcn/SKILL.md",
      source: "user",
      installedFor: ["codex"],
    },
  ] as const;

  it("prepends explicit provider-facing skill instructions for mentioned skills", () => {
    expect(
      augmentPromptWithSkillInstructions({
        text: "Gebruik $frontend-design en daarna $shadcn voor deze page",
        installedSkills: skills,
      }),
    ).toContain(
      "Use these installed skills for this request: $frontend-design (Frontend Design), $shadcn (Shadcn).",
    );
  });

  it("does not inject instructions when no installed skill is mentioned", () => {
    expect(
      augmentPromptWithSkillInstructions({
        text: "Gebruik $unknown voor deze page",
        installedSkills: skills,
      }),
    ).toBe("Gebruik $unknown voor deze page");
  });
});
