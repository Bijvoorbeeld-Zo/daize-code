import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSearchSkillsOutput, parseTrendingSkillsPage } from "./skills";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("parseSearchSkillsOutput", () => {
  it("extracts install refs, urls, slugs, and install counts from skills find output", () => {
    const output = `
Install with npx skills add <owner/repo@skill>

openai/skills@linear 1.2K installs
└ https://skills.sh/openai/skills/linear

claude-office-skills/skills@linear automation 240 installs
└ https://skills.sh/claude-office-skills/skills/linear-automation
`;

    expect(parseSearchSkillsOutput(output)).toEqual([
      {
        slug: "linear",
        installRef: "openai/skills@linear",
        url: "https://skills.sh/openai/skills/linear",
        installsLabel: "1.2K installs",
        originLabel: "OpenAI",
      },
      {
        slug: "linear-automation",
        installRef: "claude-office-skills/skills@linear automation",
        url: "https://skills.sh/claude-office-skills/skills/linear-automation",
        installsLabel: "240 installs",
        originLabel: "Anthropic",
      },
    ]);
  });
});

describe("parseTrendingSkillsPage", () => {
  it("extracts trending skills from the skills.sh page payload", () => {
    const html = `
      <div>
        <a href="/vercel-labs/skills/find-skills">
          <h3>find-skills</h3>
          <p>vercel-labs/skills</p>
          <span class="font-mono text-sm text-foreground">17.2K</span>
        </a>
        <a href="/anthropics/skills/skill-creator">
          <h3>skill creator</h3>
          <p>anthropics/skills</p>
          <span class="font-mono text-sm text-foreground">2.6K</span>
        </a>
      </div>
    `;

    expect(parseTrendingSkillsPage(html)).toEqual([
      {
        slug: "find-skills",
        name: "find-skills",
        description: "vercel-labs/skills · 17.2K installs",
        originLabel: "Vercel",
      },
      {
        slug: "skill-creator",
        name: "skill creator",
        description: "anthropics/skills · 2.6K installs",
        originLabel: "Anthropic",
      },
    ]);
  });

  it("returns an empty list when the trending payload is missing", () => {
    expect(parseTrendingSkillsPage("<html></html>")).toEqual([]);
  });
});

describe("listSkills", () => {
  it("marks symlinked Claude skill directories as claude-code installs", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "daize-skills-home-"));
    const skillSlug = "find-skills";
    const userSkillDirectory = path.join(homeDir, ".agents", "skills", skillSlug);
    const claudeSkillsDirectory = path.join(homeDir, ".claude", "skills");

    await fs.mkdir(userSkillDirectory, { recursive: true });
    await fs.mkdir(claudeSkillsDirectory, { recursive: true });
    await fs.writeFile(
      path.join(userSkillDirectory, "SKILL.md"),
      "# Find Skills\n\nHelps users discover skills.",
      "utf8",
    );
    await fs.symlink(userSkillDirectory, path.join(claudeSkillsDirectory, skillSlug), "dir");

    vi.doMock("node:os", () => ({
      default: { ...os, homedir: () => homeDir },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "<html></html>",
      } satisfies Partial<Response>),
    );

    const { listSkills } = await import("./skills");
    const result = await listSkills();
    const skill = result.installedSkills.find((entry) => entry.slug === skillSlug);

    expect(skill).toMatchObject({
      slug: skillSlug,
      installedFor: ["claude-code", "codex"],
    });
  });
});
