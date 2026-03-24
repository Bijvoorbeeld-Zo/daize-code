import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
  extractLinearAuthorizeUrl,
  getLinearMcpIssues,
  installClaudeLinearMcp,
  installCodexLinearMcp,
  readClaudeConfigHasLinearMcpServer,
  readCodexConfigHasLinearMcpServer,
  resolveClaudeConfigPath,
  resolveCodexConfigPath,
  upsertCodexLinearMcpConfig,
} from "./linearMcp";

function withTempCodexHome(configContent?: string) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "daize-test-codex-" });

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const originalCodexHome = process.env.CODEX_HOME;
        process.env.CODEX_HOME = tmpDir;
        return originalCodexHome;
      }),
      (originalCodexHome) =>
        Effect.sync(() => {
          if (originalCodexHome !== undefined) {
            process.env.CODEX_HOME = originalCodexHome;
          } else {
            delete process.env.CODEX_HOME;
          }
        }),
    );

    if (configContent !== undefined) {
      const configPath = path.join(tmpDir, "config.toml");
      yield* fileSystem.writeFileString(configPath, configContent);
    }
  });
}

function withTempClaudeConfig(configContent?: string) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "daize-test-claude-" });
    const configPath = path.join(tmpDir, ".claude.json");

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const originalPath = process.env.DAIZE_CLAUDE_CONFIG_PATH;
        process.env.DAIZE_CLAUDE_CONFIG_PATH = configPath;
        return originalPath;
      }),
      (originalPath) =>
        Effect.sync(() => {
          if (originalPath !== undefined) {
            process.env.DAIZE_CLAUDE_CONFIG_PATH = originalPath;
          } else {
            delete process.env.DAIZE_CLAUDE_CONFIG_PATH;
          }
        }),
    );

    if (configContent !== undefined) {
      yield* fileSystem.writeFileString(configPath, configContent);
    }

    return { configPath };
  });
}

it.layer(NodeServices.layer)("codexConfig", (it) => {
  describe("upsertCodexLinearMcpConfig", () => {
    it.effect("adds the features flag and Linear MCP server when missing", () => {
      const next = upsertCodexLinearMcpConfig("");
      assert.include(next, "[features]");
      assert.include(next, "rmcp_client = true");
      assert.include(next, "[mcp_servers.linear]");
      assert.include(next, 'url = "https://mcp.linear.app/mcp"');
      return Effect.void;
    });
  });

  describe("extractLinearAuthorizeUrl", () => {
    it.effect("returns the authorize URL from Codex login output", () => {
      const url = extractLinearAuthorizeUrl(
        [
          "Authorize `linear` by opening this URL in your browser:",
          "https://mcp.linear.app/authorize?response_type=code&state=test",
        ].join("\n"),
      );
      assert.strictEqual(url, "https://mcp.linear.app/authorize?response_type=code&state=test");
      return Effect.void;
    });
  });

  describe("readCodexConfigHasLinearMcpServer", () => {
    it.effect("returns true when a linear MCP server section is configured", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome(
          ["[mcp_servers.linear]", 'url = "https://mcp.linear.app/mcp"'].join("\n"),
        );
        const result = yield* readCodexConfigHasLinearMcpServer;
        assert.strictEqual(result, true);
      }),
    );
  });

  describe("readClaudeConfigHasLinearMcpServer", () => {
    it.effect("returns true when the project has a local Claude Linear MCP server", () =>
      Effect.gen(function* () {
        yield* withTempClaudeConfig(
          JSON.stringify(
            {
              projects: {
                "/tmp/daize": {
                  mcpServers: {
                    linear: {
                      type: "http",
                      url: "https://mcp.linear.app/mcp",
                    },
                  },
                },
              },
            },
            null,
            2,
          ),
        );
        const result = yield* readClaudeConfigHasLinearMcpServer("/tmp/daize");
        assert.strictEqual(result, true);
      }),
    );

    it.effect("returns true when the project .mcp.json has a Linear server", () =>
      Effect.gen(function* () {
        yield* withTempClaudeConfig("{}\n");
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "daize-project-" });
        yield* fileSystem.writeFileString(
          path.join(projectDir, ".mcp.json"),
          JSON.stringify(
            {
              mcpServers: {
                linearServer: {
                  type: "http",
                  url: "https://mcp.linear.app/mcp",
                },
              },
            },
            null,
            2,
          ),
        );

        const result = yield* readClaudeConfigHasLinearMcpServer(projectDir);
        assert.strictEqual(result, true);
      }),
    );
  });

  describe("getLinearMcpIssues", () => {
    it.effect("returns provider-specific issues when Codex and Claude are both missing", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('[mcp_servers.playwright]\ncommand = "npx"\n');
        yield* withTempClaudeConfig("{}\n");

        const issues = yield* getLinearMcpIssues("/tmp/daize");
        assert.deepStrictEqual(issues, [
          {
            kind: "linear-mcp-missing",
            provider: "codex",
            message:
              "Codex does not have a Linear MCP server configured. Install the Linear MCP in Codex before starting tasks from this page.",
          },
          {
            kind: "linear-mcp-missing",
            provider: "claudeAgent",
            message:
              "Claude Code does not have a Linear MCP server configured for this project. Install the Linear MCP in Claude Code before starting tasks from this page.",
          },
        ]);
      }),
    );
  });

  describe("installCodexLinearMcp", () => {
    it.effect("writes the Linear MCP config into CODEX_HOME/config.toml", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome("");
        const result = yield* installCodexLinearMcp;
        const fileSystem = yield* FileSystem.FileSystem;
        const configPath = yield* resolveCodexConfigPath;
        const written = yield* fileSystem.readFileString(configPath);

        assert.strictEqual(result.configPath, configPath);
        assert.strictEqual(result.changed, true);
        assert.include(written, "[mcp_servers.linear]");
        assert.include(written, 'url = "https://mcp.linear.app/mcp"');
      }),
    );
  });

  describe("installClaudeLinearMcp", () => {
    it.effect("writes the Linear MCP config into the Claude local project config", () =>
      Effect.gen(function* () {
        yield* withTempClaudeConfig("{}\n");
        const projectDir = "/tmp/daize";
        const result = yield* installClaudeLinearMcp(projectDir);
        const fileSystem = yield* FileSystem.FileSystem;
        const configPath = yield* resolveClaudeConfigPath;
        const written = yield* fileSystem.readFileString(configPath);

        assert.strictEqual(result.provider, "claudeAgent");
        assert.strictEqual(result.configPath, configPath);
        assert.strictEqual(result.changed, true);
        assert.include(written, `"${projectDir}"`);
        assert.include(written, '"mcpServers"');
        assert.include(written, '"linear"');
        assert.include(written, '"url": "https://mcp.linear.app/mcp"');
      }),
    );
  });
});
