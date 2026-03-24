import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  InstalledSkill,
  RecommendedSkill,
  SearchSkill,
  SkillInstallAgent,
  SkillsCreateInput,
  SkillsCreateResult,
  SkillsInstallInput,
  SkillsInstallSearchInput,
  SkillsInstallSearchResult,
  SkillsInstallResult,
  SkillsListResult,
  SkillsSearchResult,
} from "@daize/contracts";
import { runProcess } from "./processRunner";

const SKILL_FILE_NAME = "SKILL.md";
const SKILL_METADATA_FILE_NAME = ".daize-skill.json";
const USER_SKILLS_DIR = path.join(os.homedir(), ".agents", "skills");
const CLAUDE_SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const CODEX_SKILLS_DIR = path.join(os.homedir(), ".codex", "skills");
const BUNDLED_SKILLS_DIR = path.join(CODEX_SKILLS_DIR, ".system");
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`, "g");

interface SkillDirectory {
  slug: string;
  directoryPath: string;
}

interface InstalledSkillDirectory extends SkillDirectory {
  agent: SkillInstallAgent;
}

interface ParsedSkillMetadata {
  name: string;
  description: string;
}

interface SkillOriginMetadata {
  originLabel?: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

function slugifySkillName(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

  if (slug.length === 0) {
    throw new Error("Skill name must include letters or numbers.");
  }

  return slug;
}

function parseSkillMetadata(contents: string, slug: string): ParsedSkillMetadata {
  const frontmatterMatch = contents.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const frontmatterName = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const frontmatterDescription = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const heading = contents.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstParagraph = contents
    .replace(/^---\s*\n[\s\S]*?\n---\s*/m, "")
    .split(/\n\s*\n/)
    .map((section) => normalizeWhitespace(section.replace(/^#+\s+/gm, "")))
    .find((section) => section.length > 0);

  return {
    name: frontmatterName || heading || titleCaseFromSlug(slug),
    description:
      frontmatterDescription || firstParagraph || `Instructions and workflow for ${slug}.`,
  };
}

function parseDisplayName(contents: string): string | undefined {
  return contents.match(/^\s*display_name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
}

function inferOriginLabelFromText(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("anthropic") || normalized.includes("claude")) {
    return "Anthropic";
  }
  if (normalized.includes("openai") || normalized.includes("codex")) {
    return "OpenAI";
  }
  if (normalized.includes("vercel")) {
    return "Vercel";
  }
  if (normalized.includes("github")) {
    return "GitHub";
  }
  if (normalized.includes("microsoft") || normalized.includes("azure")) {
    return "Microsoft";
  }
  if (normalized.includes("google") || normalized.includes("gemini")) {
    return "Google";
  }
  if (normalized.includes("shadcn")) {
    return "shadcn/ui";
  }

  return undefined;
}

async function readSkillOriginMetadata(directoryPath: string): Promise<SkillOriginMetadata | null> {
  const metadataPath = path.join(directoryPath, SKILL_METADATA_FILE_NAME);

  try {
    const contents = await fs.readFile(metadataPath, "utf8");
    const parsed = JSON.parse(contents) as SkillOriginMetadata;
    return parsed.originLabel ? parsed : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    return null;
  }
}

async function readAgentDisplayName(directoryPath: string): Promise<string | undefined> {
  const agentFiles = ["openai.yml", "openai.yaml"];

  for (const fileName of agentFiles) {
    try {
      const contents = await fs.readFile(path.join(directoryPath, "agents", fileName), "utf8");
      const displayName = parseDisplayName(contents);
      if (displayName) {
        return displayName;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  return undefined;
}

async function resolveInstalledSkillOriginLabel(
  directoryPath: string,
  source: InstalledSkill["source"],
): Promise<string | undefined> {
  const storedMetadata = await readSkillOriginMetadata(directoryPath);
  if (storedMetadata?.originLabel) {
    return storedMetadata.originLabel;
  }

  const displayName = await readAgentDisplayName(directoryPath);
  const inferredDisplayName = inferOriginLabelFromText(displayName);
  if (inferredDisplayName) {
    return inferredDisplayName;
  }

  if (source === "bundled") {
    return "OpenAI";
  }

  return undefined;
}

async function writeSkillOriginMetadata(
  directoryPath: string,
  originLabel: string | undefined,
): Promise<void> {
  if (!originLabel) {
    return;
  }

  await fs.writeFile(
    path.join(directoryPath, SKILL_METADATA_FILE_NAME),
    JSON.stringify({ originLabel } satisfies SkillOriginMetadata, null, 2),
    "utf8",
  );
}

function parseOriginLabelFromInstallRef(installRef: string): string | undefined {
  const source = installRef.split("@")[0]?.trim();
  return inferOriginLabelFromText(source);
}

async function readSkillDirectories(rootDirectory: string): Promise<SkillDirectory[]> {
  try {
    const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({
        slug: entry.name,
        directoryPath: path.join(rootDirectory, entry.name),
      }));

    const existing = await Promise.all(
      directories.map(async (directory) => ({
        directory,
        hasSkillFile: await fs
          .access(path.join(directory.directoryPath, SKILL_FILE_NAME))
          .then(() => true)
          .catch(() => false),
      })),
    );

    return existing.filter((item) => item.hasSkillFile).map((item) => item.directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readInstalledSkill(
  directory: SkillDirectory,
  input: {
    source: InstalledSkill["source"];
    installedFor: ReadonlyArray<SkillInstallAgent>;
  },
): Promise<InstalledSkill> {
  const skillPath = path.join(directory.directoryPath, SKILL_FILE_NAME);
  const contents = await fs.readFile(skillPath, "utf8");
  const metadata = parseSkillMetadata(contents, directory.slug);
  const originLabel = await resolveInstalledSkillOriginLabel(directory.directoryPath, input.source);

  return {
    slug: directory.slug,
    name: metadata.name,
    description: metadata.description,
    path: skillPath,
    source: input.source,
    installedFor: [...input.installedFor],
    originLabel,
  };
}

function sortByName<T extends { name: string }>(values: ReadonlyArray<T>): T[] {
  return values.toSorted((left, right) => left.name.localeCompare(right.name));
}

async function runSkillsCommand(args: readonly string[]): Promise<string> {
  const commandOptions = {
    timeoutMs: 120_000,
    outputMode: "truncate" as const,
    maxBufferBytes: 512 * 1024,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      npm_config_color: "false",
    },
  };
  const runners: ReadonlyArray<readonly [command: string, commandArgs: readonly string[]]> = [
    ["bunx", ["skills", ...args]],
    ["npx", ["-y", "skills", ...args]],
    ["npm", ["exec", "--yes", "--package", "skills", "--", "skills", ...args]],
  ];
  const errors: string[] = [];

  for (const [command, commandArgs] of runners) {
    try {
      const result = await runProcess(command, commandArgs, commandOptions);
      return stripAnsi(`${result.stdout}\n${result.stderr}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Unable to run skills CLI. ${errors.join(" | ")}`);
}

export function parseSearchSkillsOutput(output: string): SkillsSearchResult["skills"] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const skills: SearchSkill[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index];
    if (!currentLine || !currentLine.includes("https://skills.sh/")) {
      continue;
    }

    const url = currentLine.replace(/^└\s*/, "");
    const previousLine = lines[index - 1] ?? "";
    const installsMatch = previousLine.match(/\s+(\d+(?:\.\d+)?[KM]?\s+installs)$/);
    const installRef = (
      installsMatch ? previousLine.slice(0, installsMatch.index) : previousLine
    ).trim();
    const slug = url
      .split("/")
      .toReversed()
      .find((segment) => segment.length > 0);
    if (!slug || installRef.length === 0) {
      continue;
    }

    skills.push(
      installsMatch?.[1]
        ? {
            slug,
            installRef,
            url,
            installsLabel: installsMatch[1],
            originLabel: parseOriginLabelFromInstallRef(installRef),
          }
        : {
            slug,
            installRef,
            url,
            originLabel: parseOriginLabelFromInstallRef(installRef),
          },
    );
  }

  return skills;
}

export function parseTrendingSkillsPage(html: string): RecommendedSkill[] {
  const seen = new Set<string>();
  const skills: RecommendedSkill[] = [];
  const anchorPattern = /<a\b[^>]*href="\/([^/"<>]+\/[^/"<>]+\/[^/"<>]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const [, hrefPath, contents] = match;
    const name = contents?.match(/<h3\b[^>]*>\s*([^<]+?)\s*<\/h3>/i)?.[1];
    const source = contents?.match(/<p\b[^>]*>\s*([^<]+?)\s*<\/p>/i)?.[1];
    const installs = contents?.match(/<span\b[^>]*>\s*([^<]+?)\s*<\/span>/i)?.[1];

    if (!hrefPath || !source || !name || !installs) {
      continue;
    }

    const slug = hrefPath.split("/").at(-1)?.trim();
    if (!slug) {
      continue;
    }
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);

    skills.push({
      slug,
      name: name.trim(),
      description: `${source.trim()} · ${installs.trim()} installs`,
      originLabel: inferOriginLabelFromText(source) ?? source.trim(),
    });
  }

  return skills;
}

async function loadTrendingRecommendedSkills(): Promise<RecommendedSkill[]> {
  const response = await fetch("https://skills.sh/trending", {
    headers: {
      accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`Trending request failed with status ${response.status}.`);
  }

  const html = await response.text();
  const skills = parseTrendingSkillsPage(html);
  if (skills.length === 0) {
    throw new Error("Trending page did not contain any parseable skills.");
  }

  return skills;
}

export async function listSkills(): Promise<SkillsListResult> {
  const [userDirectories, claudeDirectories, codexDirectories, bundledDirectories] =
    await Promise.all([
      readSkillDirectories(USER_SKILLS_DIR),
      readSkillDirectories(CLAUDE_SKILLS_DIR),
      readSkillDirectories(CODEX_SKILLS_DIR),
      readSkillDirectories(BUNDLED_SKILLS_DIR),
    ]);

  const installedDirectoryEntries: InstalledSkillDirectory[] = [
    ...userDirectories.map((directory) => ({
      slug: directory.slug,
      directoryPath: directory.directoryPath,
      agent: "codex" as const,
    })),
    ...claudeDirectories.map((directory) => ({
      slug: directory.slug,
      directoryPath: directory.directoryPath,
      agent: "claude-code" as const,
    })),
    ...codexDirectories.map((directory) => ({
      slug: directory.slug,
      directoryPath: directory.directoryPath,
      agent: "codex" as const,
    })),
  ];
  const bundledSlugs = new Set(bundledDirectories.map((directory) => directory.slug));
  const installedDirectoryBySlug = new Map<
    string,
    {
      directory: SkillDirectory;
      installedFor: Set<SkillInstallAgent>;
    }
  >();

  for (const entry of installedDirectoryEntries) {
    const existing = installedDirectoryBySlug.get(entry.slug);
    if (existing) {
      existing.installedFor.add(entry.agent);
      if (
        existing.directory.directoryPath.startsWith(CODEX_SKILLS_DIR) &&
        !entry.directoryPath.startsWith(CODEX_SKILLS_DIR)
      ) {
        existing.directory = {
          slug: entry.slug,
          directoryPath: entry.directoryPath,
        };
      }
      continue;
    }

    installedDirectoryBySlug.set(entry.slug, {
      directory: {
        slug: entry.slug,
        directoryPath: entry.directoryPath,
      },
      installedFor: new Set([entry.agent]),
    });
  }

  const [installedSkills, trendingResult] = await Promise.all([
    Promise.all(
      [...installedDirectoryBySlug.values()].map(({ directory, installedFor }) =>
        readInstalledSkill(directory, {
          source: bundledSlugs.has(directory.slug) ? "bundled" : "user",
          installedFor: [...installedFor].toSorted(),
        }),
      ),
    ),
    loadTrendingRecommendedSkills()
      .then((skills) => ({ skills, error: undefined }))
      .catch((error) => ({
        skills: [] as RecommendedSkill[],
        error: error instanceof Error ? error.message : "Kon trending skills niet vinden.",
      })),
  ]);

  const sortedInstalledSkills = sortByName(installedSkills);
  const installedSlugs = new Set(sortedInstalledSkills.map((skill) => skill.slug));
  const recommendedSkills = sortByName(
    trendingResult.skills.filter((skill) => !installedSlugs.has(skill.slug)),
  );

  return {
    installedSkills: sortedInstalledSkills,
    recommendedSkills,
    trendingError: trendingResult.error,
    syncedAt: new Date().toISOString(),
  };
}

async function ensureBundledSkillDirectory(slug: string): Promise<SkillDirectory> {
  const bundledDirectories = await readSkillDirectories(BUNDLED_SKILLS_DIR);
  const directory = bundledDirectories.find((entry) => entry.slug === slug);
  if (!directory) {
    throw new Error(`Bundled skill "${slug}" is not available.`);
  }
  return directory;
}

export async function installBundledSkill(input: SkillsInstallInput): Promise<SkillsInstallResult> {
  const sourceDirectory = await ensureBundledSkillDirectory(input.slug);
  const claudeTargetDirectory = path.join(USER_SKILLS_DIR, input.slug);
  const codexTargetDirectory = path.join(CODEX_SKILLS_DIR, input.slug);
  const originLabel = "OpenAI";
  const [claudeInstalled, codexInstalled] = await Promise.all([
    fs
      .access(path.join(claudeTargetDirectory, SKILL_FILE_NAME))
      .then(() => true)
      .catch(() => false),
    fs
      .access(path.join(codexTargetDirectory, SKILL_FILE_NAME))
      .then(() => true)
      .catch(() => false),
  ]);

  if (!claudeInstalled) {
    await fs.mkdir(USER_SKILLS_DIR, { recursive: true });
    await fs.cp(sourceDirectory.directoryPath, claudeTargetDirectory, {
      recursive: true,
      errorOnExist: true,
    });
    await writeSkillOriginMetadata(claudeTargetDirectory, originLabel);
  }
  if (!codexInstalled) {
    await fs.mkdir(CODEX_SKILLS_DIR, { recursive: true });
    await fs.cp(sourceDirectory.directoryPath, codexTargetDirectory, {
      recursive: true,
      errorOnExist: true,
    });
    await writeSkillOriginMetadata(codexTargetDirectory, originLabel);
  }

  return {
    skill: await readInstalledSkill(
      { slug: input.slug, directoryPath: claudeTargetDirectory },
      { source: "bundled", installedFor: ["claude-code", "codex"] },
    ),
    created: !claudeInstalled || !codexInstalled,
  };
}

export async function searchSkills(query: string): Promise<SkillsSearchResult> {
  const output = await runSkillsCommand(["find", query]);

  return {
    skills: parseSearchSkillsOutput(output),
  };
}

export async function installSearchSkill(
  input: SkillsInstallSearchInput,
): Promise<SkillsInstallSearchResult> {
  const codexTargetDirectory = path.join(CODEX_SKILLS_DIR, input.slug);
  const claudeTargetDirectory = path.join(CLAUDE_SKILLS_DIR, input.slug);
  const originLabel = parseOriginLabelFromInstallRef(input.installRef);
  const [codexInstalled, claudeInstalled] = await Promise.all([
    fs
      .access(path.join(codexTargetDirectory, SKILL_FILE_NAME))
      .then(() => true)
      .catch(() => false),
    fs
      .access(path.join(claudeTargetDirectory, SKILL_FILE_NAME))
      .then(() => true)
      .catch(() => false),
  ]);

  if (!codexInstalled || !claudeInstalled) {
    await fs.mkdir(CODEX_SKILLS_DIR, { recursive: true });
    await runSkillsCommand([
      "add",
      input.installRef,
      "-g",
      "-a",
      "codex",
      "-a",
      "claude-code",
      "-y",
    ]);
    await Promise.all([
      writeSkillOriginMetadata(codexTargetDirectory, originLabel),
      writeSkillOriginMetadata(claudeTargetDirectory, originLabel),
    ]);
  }

  return {
    skill: await readInstalledSkill(
      {
        slug: input.slug,
        directoryPath: claudeInstalled ? claudeTargetDirectory : codexTargetDirectory,
      },
      { source: "user", installedFor: ["claude-code", "codex"] },
    ),
    created: !codexInstalled || !claudeInstalled,
  };
}

function renderSkillTemplate(input: { name: string; description: string }): string {
  return `---
name: ${input.name}
description: ${input.description}
---

# ${input.name}

## Purpose

Describe when this skill should be used.

## Workflow

1. Inspect the relevant project context first.
2. Apply the specific workflow or conventions for this skill.
3. Return concise, actionable output.
`;
}

export async function createSkill(input: SkillsCreateInput): Promise<SkillsCreateResult> {
  const slug = slugifySkillName(input.name);
  const targetDirectory = path.join(USER_SKILLS_DIR, slug);
  const targetSkillPath = path.join(targetDirectory, SKILL_FILE_NAME);
  const alreadyInstalled = await fs
    .access(targetSkillPath)
    .then(() => true)
    .catch(() => false);

  if (!alreadyInstalled) {
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.writeFile(
      targetSkillPath,
      renderSkillTemplate({
        name: input.name,
        description: input.description ?? `Describe the workflow for ${input.name}.`,
      }),
      "utf8",
    );
  }

  return {
    skill: await readInstalledSkill(
      { slug, directoryPath: targetDirectory },
      { source: "user", installedFor: ["codex"] },
    ),
    created: !alreadyInstalled,
  };
}
