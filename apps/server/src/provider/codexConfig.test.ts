import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import {
  extractLinearAuthorizeUrl,
  getCodexLinearMcpIssue,
  installCodexLinearMcp,
  readCodexConfigHasLinearMcpServer,
  resolveCodexConfigPath,
  upsertCodexLinearMcpConfig,
} from "./codexConfig";

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

  describe("getCodexLinearMcpIssue", () => {
    it.effect("returns an issue when the Linear MCP server is missing", () =>
      Effect.gen(function* () {
        yield* withTempCodexHome('[mcp_servers.playwright]\ncommand = "npx"\n');
        const issues = yield* getCodexLinearMcpIssue;
        assert.strictEqual(issues[0]?.kind, "codex.linear-mcp-missing");
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
});
