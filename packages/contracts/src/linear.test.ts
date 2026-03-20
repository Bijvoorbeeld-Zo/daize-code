import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  LinearConnectInput,
  LinearConnectionSummary,
  LinearListIssuesInput,
  LinearListIssuesResult,
  LinearStartIssueInput,
  LinearStartIssueResult,
} from "./linear";

const decodeConnectInput = Schema.decodeUnknownEffect(LinearConnectInput);
const decodeConnectionSummary = Schema.decodeUnknownEffect(LinearConnectionSummary);
const decodeListIssuesInput = Schema.decodeUnknownEffect(LinearListIssuesInput);
const decodeListIssuesResult = Schema.decodeUnknownEffect(LinearListIssuesResult);
const decodeStartIssueInput = Schema.decodeUnknownEffect(LinearStartIssueInput);
const decodeStartIssueResult = Schema.decodeUnknownEffect(LinearStartIssueResult);

it.effect("trims and decodes Linear connect input", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeConnectInput({
      apiKey: "  lin_api_test_123  ",
    });

    assert.strictEqual(parsed.apiKey, "lin_api_test_123");
  }),
);

it.effect("defaults list issues refresh to false", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeListIssuesInput({});

    assert.strictEqual(parsed.refresh, false);
  }),
);

it.effect("trims and decodes Linear start issue input", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeStartIssueInput({
      issueId: "  issue-1  ",
    });

    assert.strictEqual(parsed.issueId, "issue-1");
  }),
);

it.effect("decodes connection summaries with nullable metadata", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeConnectionSummary({
      status: "connected",
      workspaceName: "Acme",
      viewerName: "Jane Doe",
      viewerEmail: "jane@example.com",
      lastSyncAt: "2026-03-19T10:00:00.000Z",
      message: null,
    });

    assert.strictEqual(parsed.status, "connected");
    assert.strictEqual(parsed.workspaceName, "Acme");
  }),
);

it.effect("decodes list issue results", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeListIssuesResult({
      issues: [
        {
          id: "issue-1",
          identifier: "ENG-123",
          title: "Hook up Linear tasks",
          project: {
            id: "project-1",
            name: "Daize Launch",
            icon: null,
          },
          status: {
            name: "In Progress",
            color: "#f59e0b",
          },
          assigneeName: "Jane Doe",
        },
      ],
      syncedAt: "2026-03-19T10:00:00.000Z",
    });

    assert.strictEqual(parsed.issues[0]?.identifier, "ENG-123");
    assert.strictEqual(parsed.issues[0]?.project?.name, "Daize Launch");
    assert.strictEqual(parsed.issues[0]?.status.name, "In Progress");
  }),
);

it.effect("decodes start issue results", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeStartIssueResult({
      issue: {
        id: "issue-1",
        identifier: "ENG-123",
        title: "Hook up Linear tasks",
        project: {
          id: "project-1",
          name: "Daize Launch",
          icon: null,
        },
        status: {
          name: "In Progress",
          color: "#f59e0b",
        },
        assigneeName: "Jane Doe",
      },
      syncedAt: "2026-03-19T10:00:00.000Z",
    });

    assert.strictEqual(parsed.issue.status.name, "In Progress");
  }),
);
