import * as OS from "node:os";
import { spawn } from "node:child_process";

import type { ServerConfigIssue } from "@daize/contracts";
import { Effect, FileSystem, Path, Schema } from "effect";

const LINEAR_MCP_URL = "https://mcp.linear.app/mcp";
const LINEAR_MCP_AUTHORIZE_URL_PATTERN = /https:\/\/mcp\.linear\.app\/authorize\S+/;

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

export const getCodexLinearMcpIssue = Effect.gen(function* () {
  const hasLinearMcpServer = yield* readCodexConfigHasLinearMcpServer;
  if (hasLinearMcpServer) {
    return [] as ServerConfigIssue[];
  }

  return [
    {
      kind: "codex.linear-mcp-missing",
      message:
        "Codex does not have a Linear MCP server configured. Install the Linear MCP in your Codex config before starting tasks from this page.",
    },
  ] satisfies ServerConfigIssue[];
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
    configPath,
    changed: next !== existing,
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
