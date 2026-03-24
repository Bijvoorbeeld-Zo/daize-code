import * as OS from "node:os";
import { spawn } from "node:child_process";

import type { ProviderKind, ServerConfigIssue } from "@daize/contracts";
import { Effect, FileSystem, Path, Schema } from "effect";

const LINEAR_MCP_URL = "https://mcp.linear.app/mcp";
const LINEAR_MCP_AUTHORIZE_URL_PATTERN = /https:\/\/mcp\.linear\.app\/authorize\S+/;
const LINEAR_MCP_SERVER_NAME = "linear";

class CodexLinearMcpAuthError extends Schema.TaggedErrorClass<CodexLinearMcpAuthError>()(
  "CodexLinearMcpAuthError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const resolveCodexConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const codexHome = process.env.CODEX_HOME || path.join(OS.homedir(), ".codex");
  return path.join(codexHome, "config.toml");
});

export const resolveClaudeConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const configuredPath = process.env.DAIZE_CLAUDE_CONFIG_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return path.join(OS.homedir(), ".claude.json");
});

function splitLines(content: string): string[] {
  return content.length === 0 ? [] : content.split("\n");
}

function upsertSectionKey(input: {
  content: string;
  section: string;
  key: string;
  value: string;
}): string {
  const lines = splitLines(input.content);
  const sectionHeader = `[${input.section}]`;
  const nextSectionPattern = /^\[.+\]$/;
  const keyPattern = new RegExp(`^${input.key}\\s*=`);
  const nextLine = `${input.key} = ${input.value}`;

  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === sectionHeader) {
      sectionStart = index;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (nextSectionPattern.test(lines[cursor]!.trim())) {
          sectionEnd = cursor;
          break;
        }
      }
      break;
    }
  }

  if (sectionStart === -1) {
    const prefix = input.content.trim().length > 0 ? `${input.content.trimEnd()}\n\n` : "";
    return `${prefix}${sectionHeader}\n${nextLine}\n`;
  }

  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (keyPattern.test(lines[index]!.trim())) {
      lines[index] = nextLine;
      return `${lines.join("\n").replace(/\n*$/, "\n")}`;
    }
  }

  lines.splice(sectionEnd, 0, nextLine);
  return `${lines.join("\n").replace(/\n*$/, "\n")}`;
}

export function upsertCodexLinearMcpConfig(content: string): string {
  const withRmcpClient = upsertSectionKey({
    content,
    section: "features",
    key: "rmcp_client",
    value: "true",
  });

  return upsertSectionKey({
    content: withRmcpClient,
    section: "mcp_servers.linear",
    key: "url",
    value: `"${LINEAR_MCP_URL}"`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringIncludesLinear(value: string): boolean {
  return value.toLowerCase().includes("linear");
}

function mcpServerValueLooksLinear(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (typeof value.url === "string" && stringIncludesLinear(value.url)) {
    return true;
  }

  if (typeof value.command === "string" && stringIncludesLinear(value.command)) {
    return true;
  }

  if (
    Array.isArray(value.args) &&
    value.args.some((arg) => typeof arg === "string" && stringIncludesLinear(arg))
  ) {
    return true;
  }

  return false;
}

function mcpServersContainLinear(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([name, server]) => {
    if (stringIncludesLinear(name)) {
      return true;
    }
    return mcpServerValueLooksLinear(server);
  });
}

function parseJsonRecord(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getClaudeProjectConfig(
  root: Record<string, unknown>,
  cwd: string,
): Record<string, unknown> | undefined {
  const projects = root.projects;
  if (!isRecord(projects)) return undefined;
  const project = projects[cwd];
  return isRecord(project) ? project : undefined;
}

function upsertClaudeLinearMcpConfig(content: string, cwd: string): string {
  const root = parseJsonRecord(content) ?? {};
  const existingProjects = isRecord(root.projects) ? root.projects : {};
  const existingProject = isRecord(existingProjects[cwd]) ? existingProjects[cwd] : {};
  const existingProjectServers = isRecord(existingProject.mcpServers)
    ? existingProject.mcpServers
    : {};

  const nextRoot: Record<string, unknown> = {
    ...root,
    projects: {
      ...existingProjects,
      [cwd]: {
        ...existingProject,
        mcpServers: {
          ...existingProjectServers,
          [LINEAR_MCP_SERVER_NAME]: {
            type: "http",
            url: LINEAR_MCP_URL,
          },
        },
      },
    },
  };

  return `${JSON.stringify(nextRoot, null, 2)}\n`;
}

export const readCodexConfigHasLinearMcpServer = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const configPath = yield* resolveCodexConfigPath;
  const content = yield* fileSystem
    .readFileString(configPath)
    .pipe(Effect.orElseSucceed(() => undefined));
  if (content === undefined) {
    return false;
  }

  let activeMcpServerName: string | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[mcp_servers\.(.+)\]$/);
    if (sectionMatch) {
      const rawSectionName = sectionMatch[1] ?? "";
      const sectionName = rawSectionName.replace(/^["']|["']$/g, "");
      activeMcpServerName = sectionName;
      if (sectionName.toLowerCase().includes("linear")) {
        return true;
      }
      continue;
    }

    if (trimmed.startsWith("[")) {
      activeMcpServerName = null;
      continue;
    }

    if (activeMcpServerName === null) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (lower.includes("linear.app") || lower.includes("@linear/") || lower.includes(" linear")) {
      return true;
    }
  }

  return false;
});

export const readClaudeConfigHasLinearMcpServer = (cwd: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const claudeConfigPath = yield* resolveClaudeConfigPath;
    const [claudeConfigContent, projectMcpContent] = yield* Effect.all([
      fileSystem.readFileString(claudeConfigPath).pipe(Effect.orElseSucceed(() => undefined)),
      fileSystem
        .readFileString(path.join(cwd, ".mcp.json"))
        .pipe(Effect.orElseSucceed(() => undefined)),
    ]);

    const claudeConfig = claudeConfigContent ? parseJsonRecord(claudeConfigContent) : undefined;
    if (claudeConfig) {
      if (mcpServersContainLinear(claudeConfig.mcpServers)) {
        return true;
      }

      const projectConfig = getClaudeProjectConfig(claudeConfig, cwd);
      if (projectConfig && mcpServersContainLinear(projectConfig.mcpServers)) {
        return true;
      }
    }

    const projectMcp = projectMcpContent ? parseJsonRecord(projectMcpContent) : undefined;
    if (projectMcp && mcpServersContainLinear(projectMcp.mcpServers)) {
      return true;
    }

    return false;
  });

function getLinearMcpMissingIssue(provider: ProviderKind): ServerConfigIssue {
  return {
    kind: "linear-mcp-missing",
    provider,
    message:
      provider === "codex"
        ? "Codex does not have a Linear MCP server configured. Install the Linear MCP in Codex before starting tasks from this page."
        : "Claude Code does not have a Linear MCP server configured for this project. Install the Linear MCP in Claude Code before starting tasks from this page.",
  };
}

export const getLinearMcpIssues = (cwd: string) =>
  Effect.gen(function* () {
    const [hasCodexLinearMcpServer, hasClaudeLinearMcpServer] = yield* Effect.all([
      readCodexConfigHasLinearMcpServer,
      readClaudeConfigHasLinearMcpServer(cwd),
    ]);

    const issues: ServerConfigIssue[] = [];
    if (!hasCodexLinearMcpServer) {
      issues.push(getLinearMcpMissingIssue("codex"));
    }
    if (!hasClaudeLinearMcpServer) {
      issues.push(getLinearMcpMissingIssue("claudeAgent"));
    }
    return issues;
  });

export const installCodexLinearMcp = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configPath = yield* resolveCodexConfigPath;
  const existing = yield* fileSystem
    .readFileString(configPath)
    .pipe(Effect.orElseSucceed(() => ""));
  const next = upsertCodexLinearMcpConfig(existing);

  yield* fileSystem.makeDirectory(path.dirname(configPath), { recursive: true });
  yield* fileSystem.writeFileString(configPath, next);

  return {
    provider: "codex" as const,
    configPath,
    changed: next !== existing,
  };
});

export const installClaudeLinearMcp = (cwd: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configPath = yield* resolveClaudeConfigPath;
    const alreadyConfigured = yield* readClaudeConfigHasLinearMcpServer(cwd);
    if (alreadyConfigured) {
      return {
        provider: "claudeAgent" as const,
        configPath,
        changed: false,
        authStarted: false,
        browserOpened: false,
      };
    }

    const existing = yield* fileSystem
      .readFileString(configPath)
      .pipe(Effect.orElseSucceed(() => ""));
    const next = upsertClaudeLinearMcpConfig(existing, cwd);

    yield* fileSystem.makeDirectory(path.dirname(configPath), { recursive: true });
    yield* fileSystem.writeFileString(configPath, next);

    return {
      provider: "claudeAgent" as const,
      configPath,
      changed: true,
      authStarted: false,
      browserOpened: false,
    };
  });

export function extractLinearAuthorizeUrl(output: string): string | undefined {
  return output.match(LINEAR_MCP_AUTHORIZE_URL_PATTERN)?.[0];
}

export const startCodexLinearMcpAuth = Effect.gen(function* () {
  const testAuthUrl = process.env.DAIZE_TEST_LINEAR_MCP_AUTH_URL;

  if (testAuthUrl) {
    return {
      authStarted: true,
      authUrl: testAuthUrl,
      browserOpened: false,
    };
  }

  const authUrl = yield* Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("codex", ["mcp", "login", "linear"], {
          env: process.env,
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
        });

        let combinedOutput = "";
        let settled = false;
        const timeout = setTimeout(() => {
          fail("Timed out while starting Linear MCP login.");
        }, 10_000);
        timeout.unref();

        const cleanup = () => {
          clearTimeout(timeout);
          child.stdout.removeListener("data", handleChunk);
          child.stderr.removeListener("data", handleChunk);
          child.removeListener("error", handleError);
          child.removeListener("exit", handleExit);
        };

        const succeed = (url: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          child.stdout.resume();
          child.stderr.resume();
          resolve(url);
        };

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          child.kill();
          reject(new Error(message));
        };

        const handleChunk = (chunk: Buffer | string) => {
          combinedOutput += chunk.toString();
          const url = extractLinearAuthorizeUrl(combinedOutput);
          if (url) {
            succeed(url);
          }
        };

        const handleError = (error: Error) => {
          fail(`Could not start Codex MCP login: ${error.message}`);
        };

        const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
          const detail = combinedOutput.trim();
          fail(
            detail.length > 0
              ? detail
              : `Codex MCP login exited before the authorize URL was ready (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
          );
        };

        child.stdout.on("data", handleChunk);
        child.stderr.on("data", handleChunk);
        child.once("error", handleError);
        child.once("exit", handleExit);
      }),
    catch: (cause) =>
      new CodexLinearMcpAuthError({ message: "Could not start Linear MCP login.", cause }),
  });

  return {
    authStarted: true,
    authUrl,
    browserOpened: false,
  };
});

export const installLinearMcp = (input: { provider: ProviderKind; cwd: string }) =>
  Effect.gen(function* () {
    if (input.provider === "claudeAgent") {
      return yield* installClaudeLinearMcp(input.cwd);
    }

    const installResult = yield* installCodexLinearMcp;
    const authResult = yield* startCodexLinearMcpAuth;
    return {
      ...installResult,
      ...authResult,
    };
  });
