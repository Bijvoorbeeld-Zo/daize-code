import {
  type LinearConnectionStatus,
  LinearConnectionSummary,
  type LinearConnectInput,
  type LinearConnectResult,
  type LinearDisconnectResult,
  type LinearGetConnectionResult,
  LinearIssueSummary,
  type LinearListIssuesInput,
  type LinearListIssuesResult,
} from "@daize/contracts";
import { Config, DateTime, Effect, Layer, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import {
  LinearAuthError,
  LinearApiError,
  LinearNotConnectedError,
  LinearPersistenceError,
  type LinearServiceError,
} from "../Errors.ts";
import { LinearService, type LinearServiceShape } from "../Services/LinearService.ts";
import {
  LinearIntegrationRepository,
  type LinearIntegrationRecord,
} from "../../persistence/Services/LinearIntegration.ts";

const LINEAR_INTEGRATION_KEY = "linear" as const;
const LINEAR_PROVIDER = "linear" as const;
const OPEN_ISSUE_LIMIT = 100;

const LinearEnvConfig = Config.all({
  apiBaseUrl: Config.string("DAIZE_LINEAR_API_URL").pipe(
    Config.withDefault("https://api.linear.app"),
  ),
});

const LinearGraphqlErrorSchema = Schema.Struct({
  message: Schema.String,
});

const ConnectViewerSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
});

const ConnectResponseSchema = Schema.Struct({
  viewer: ConnectViewerSchema,
});

const GraphqlIssueNodeSchema = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
  canceledAt: Schema.NullOr(Schema.String),
  state: Schema.Struct({
    name: Schema.String,
    color: Schema.NullOr(Schema.String),
  }),
  assignee: Schema.NullOr(
    Schema.Struct({
      name: Schema.NullOr(Schema.String),
    }),
  ),
});

const ListIssuesResponseSchema = Schema.Struct({
  viewer: Schema.Struct({
    assignedIssues: Schema.Struct({
      nodes: Schema.Array(GraphqlIssueNodeSchema),
    }),
  }),
});

const ConnectEnvelopeSchema = Schema.Struct({
  data: Schema.optional(ConnectResponseSchema),
  errors: Schema.optional(Schema.Array(LinearGraphqlErrorSchema)),
});

const ListIssuesEnvelopeSchema = Schema.Struct({
  data: Schema.optional(ListIssuesResponseSchema),
  errors: Schema.optional(Schema.Array(LinearGraphqlErrorSchema)),
});

const CONNECT_QUERY = `
  query LinearTasksConnect {
    viewer {
      id
      name
      email
    }
  }
`;

const LIST_MY_ISSUES_QUERY = `
  query LinearTasksListMyIssues($first: Int!) {
    viewer {
      assignedIssues(first: $first, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          completedAt
          canceledAt
          state {
            name
            color
          }
          assignee {
            name
          }
        }
      }
    }
  }
`;

function toOptionalTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeConnection(input: {
  status: LinearConnectionStatus;
  workspaceName?: string | null;
  viewerName?: string | null;
  viewerEmail?: string | null;
  lastSyncAt?: string | null;
  message?: string | null;
}): typeof LinearConnectionSummary.Type {
  return LinearConnectionSummary.makeUnsafe({
    status: input.status,
    workspaceName: input.workspaceName ?? null,
    viewerName: input.viewerName ?? null,
    viewerEmail: input.viewerEmail ?? null,
    lastSyncAt: input.lastSyncAt ?? null,
    message: input.message ?? null,
  });
}

function disconnectedConnection(message: string | null = null) {
  return summarizeConnection({
    status: "disconnected",
    message,
  });
}

function toConnectionFromRecord(record: LinearIntegrationRecord) {
  return summarizeConnection({
    status: record.status,
    workspaceName: toOptionalTrimmed(record.workspaceName),
    viewerName: toOptionalTrimmed(record.viewerName),
    viewerEmail: toOptionalTrimmed(record.viewerEmail),
    lastSyncAt: record.lastSyncAt,
    message: toOptionalTrimmed(record.lastError),
  });
}

function toOpenIssueSummary(
  issue: typeof GraphqlIssueNodeSchema.Type,
): typeof LinearIssueSummary.Type | null {
  if (issue.completedAt !== null || issue.canceledAt !== null) {
    return null;
  }

  return LinearIssueSummary.makeUnsafe({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: {
      name: issue.state.name,
      color: toOptionalTrimmed(issue.state.color),
    },
    assigneeName: toOptionalTrimmed(issue.assignee?.name),
  });
}

function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

const makeLinearService = Effect.gen(function* () {
  const linearConfig = yield* LinearEnvConfig.asEffect();
  const httpClient = yield* HttpClient.HttpClient;
  const repository = yield* LinearIntegrationRepository;

  const persistRecord = (record: LinearIntegrationRecord) =>
    repository.upsertConnection(record).pipe(
      Effect.mapError(
        (cause) =>
          new LinearPersistenceError({
            detail: "Failed to persist Linear connection state.",
            cause,
          }),
      ),
    );

  const readRecord = () =>
    repository.get().pipe(
      Effect.mapError(
        (cause) =>
          new LinearPersistenceError({
            detail: "Failed to read Linear connection state.",
            cause,
          }),
      ),
    );

  const clearRecord = () =>
    repository.clear().pipe(
      Effect.mapError(
        (cause) =>
          new LinearPersistenceError({
            detail: "Failed to clear Linear connection state.",
            cause,
          }),
      ),
    );

  const executeGraphqlRequest = (input: {
    token: string;
    query: string;
    variables?: Record<string, unknown>;
    authErrorMessage: string;
  }): Effect.Effect<unknown, LinearAuthError | LinearApiError> =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(`${linearConfig.apiBaseUrl}/graphql`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeader("Authorization", input.token),
        HttpClientRequest.bodyJson({
          query: input.query,
          variables: input.variables ?? {},
        }),
        Effect.flatMap(httpClient.execute),
        Effect.mapError(
          (cause) =>
            new LinearApiError({
              detail: "Failed to reach the Linear API.",
              cause,
            }),
        ),
      );

      if (isAuthStatus(response.status)) {
        return yield* new LinearAuthError({
          detail: input.authErrorMessage,
        });
      }

      return yield* response.json.pipe(
        Effect.mapError(
          (cause) =>
            new LinearApiError({
              detail: "Linear API returned an invalid response payload.",
              cause,
            }),
        ),
      );
    });

  const resolveGraphqlEnvelopeError = (
    errors: ReadonlyArray<typeof LinearGraphqlErrorSchema.Type> | undefined,
    authErrorMessage: string,
  ): LinearAuthError | LinearApiError | null => {
    const firstError = errors?.[0]?.message?.trim();
    if (!firstError) {
      return null;
    }

    const lower = firstError.toLowerCase();
    if (
      lower.includes("auth") ||
      lower.includes("unauthorized") ||
      lower.includes("forbidden") ||
      lower.includes("invalid token")
    ) {
      return new LinearAuthError({
        detail: authErrorMessage,
      });
    }

    return new LinearApiError({
      detail: `Linear API error: ${firstError}`,
    });
  };

  const executeConnectQuery = (apiKey: string) =>
    Effect.gen(function* () {
      const rawEnvelope = yield* executeGraphqlRequest({
        token: apiKey,
        query: CONNECT_QUERY,
        authErrorMessage: "Linear rejected that API key. Check it and try again.",
      });

      const envelope = yield* Effect.try({
        try: () =>
          Schema.decodeUnknownSync(ConnectEnvelopeSchema as never)(
            rawEnvelope,
          ) as typeof ConnectEnvelopeSchema.Type,
        catch: (cause) =>
          new LinearApiError({
            detail: "Linear API returned an invalid response payload.",
            cause,
          }),
      });

      const envelopeError = resolveGraphqlEnvelopeError(
        envelope.errors,
        "Linear rejected that API key. Check it and try again.",
      );
      if (envelopeError) {
        return yield* envelopeError;
      }

      if (envelope.data === undefined) {
        return yield* new LinearApiError({
          detail: "Linear API returned no data.",
        });
      }

      return envelope.data;
    });

  const executeListIssuesQuery = (token: string) =>
    Effect.gen(function* () {
      const rawEnvelope = yield* executeGraphqlRequest({
        token,
        query: LIST_MY_ISSUES_QUERY,
        variables: { first: OPEN_ISSUE_LIMIT },
        authErrorMessage: "Your saved Linear API key is no longer valid. Reconnect it in Settings.",
      });

      const envelope = yield* Effect.try({
        try: () =>
          Schema.decodeUnknownSync(ListIssuesEnvelopeSchema as never)(
            rawEnvelope,
          ) as typeof ListIssuesEnvelopeSchema.Type,
        catch: (cause) =>
          new LinearApiError({
            detail: "Linear API returned an invalid response payload.",
            cause,
          }),
      });

      const envelopeError = resolveGraphqlEnvelopeError(
        envelope.errors,
        "Your saved Linear API key is no longer valid. Reconnect it in Settings.",
      );
      if (envelopeError) {
        return yield* envelopeError;
      }

      if (envelope.data === undefined) {
        return yield* new LinearApiError({
          detail: "Linear API returned no data.",
        });
      }

      return envelope.data;
    });

  const getConnection = (): Effect.Effect<LinearGetConnectionResult, LinearServiceError> =>
    Effect.gen(function* () {
      const record = yield* readRecord();
      return {
        connection: Option.match(record, {
          onNone: () => disconnectedConnection(),
          onSome: toConnectionFromRecord,
        }),
      } satisfies LinearGetConnectionResult;
    });

  const connect = (
    input: LinearConnectInput,
  ): Effect.Effect<LinearConnectResult, LinearServiceError> =>
    Effect.gen(function* () {
      const result: typeof ConnectResponseSchema.Type = yield* executeConnectQuery(input.apiKey);

      const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
      const workspaceName = null;
      const viewerName = toOptionalTrimmed(result.viewer.name);
      const viewerEmail = toOptionalTrimmed(result.viewer.email);
      const connection = summarizeConnection({
        status: "connected",
        workspaceName,
        viewerName,
        viewerEmail,
        lastSyncAt: now,
      });

      yield* persistRecord({
        integrationKey: LINEAR_INTEGRATION_KEY,
        provider: LINEAR_PROVIDER,
        accessToken: input.apiKey,
        workspaceName,
        viewerName,
        viewerEmail,
        status: "connected",
        lastSyncAt: now,
        updatedAt: now,
        lastError: null,
      });

      return {
        connection,
      } satisfies LinearConnectResult;
    });

  const disconnect = (): Effect.Effect<LinearDisconnectResult, LinearServiceError> =>
    Effect.gen(function* () {
      yield* clearRecord();
      return {
        connection: disconnectedConnection(),
      } satisfies LinearDisconnectResult;
    });

  const listMyIssues = (
    _input: LinearListIssuesInput,
  ): Effect.Effect<LinearListIssuesResult, LinearServiceError> =>
    Effect.gen(function* () {
      const record = yield* readRecord();
      const existing = Option.getOrNull(record);
      if (existing === null) {
        return yield* new LinearNotConnectedError({
          detail: "Linear is not connected yet. Add an API key in Settings first.",
        });
      }

      const token = toOptionalTrimmed(existing.accessToken);
      if (!token) {
        return yield* new LinearNotConnectedError({
          detail: "Linear is not connected yet. Add an API key in Settings first.",
        });
      }

      const listResult: typeof ListIssuesResponseSchema.Type = yield* executeListIssuesQuery(
        token,
      ).pipe(
        Effect.tapError((error) =>
          Schema.is(LinearAuthError)(error)
            ? Effect.gen(function* () {
                const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
                yield* persistRecord({
                  ...existing,
                  status: "invalid",
                  updatedAt: now,
                  lastError: error.detail,
                });
              })
            : Effect.void,
        ),
      );

      const issues = listResult.viewer.assignedIssues.nodes
        .map(toOpenIssueSummary)
        .filter((issue): issue is typeof LinearIssueSummary.Type => issue !== null);
      const syncedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));

      yield* persistRecord({
        ...existing,
        status: "connected",
        lastSyncAt: syncedAt,
        updatedAt: syncedAt,
        lastError: null,
      });

      return {
        issues,
        syncedAt,
      } satisfies LinearListIssuesResult;
    });

  return {
    getConnection,
    connect,
    disconnect,
    listMyIssues,
  } satisfies LinearServiceShape;
});

export const LinearServiceLive = Layer.effect(LinearService, makeLinearService);
