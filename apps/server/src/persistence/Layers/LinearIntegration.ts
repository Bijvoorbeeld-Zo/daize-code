import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  LinearIntegrationRecord,
  LinearIntegrationRepository,
  type LinearIntegrationRepositoryShape,
} from "../Services/LinearIntegration.ts";

const LINEAR_INTEGRATION_KEY = "linear" as const;

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeLinearIntegrationRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Defensive schema bootstrap so the Linear integration works even if the
  // running dev server has not been restarted since the migration was added.
  yield* sql`
    CREATE TABLE IF NOT EXISTS linear_integrations (
      integration_key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      access_token TEXT,
      workspace_name TEXT,
      viewer_name TEXT,
      viewer_email TEXT,
      status TEXT NOT NULL,
      last_sync_at TEXT,
      updated_at TEXT NOT NULL,
      last_error TEXT
    )
  `.pipe(Effect.mapError(toPersistenceSqlError("LinearIntegrationRepository.ensureTable:query")));

  const getLinearIntegrationRow = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: LinearIntegrationRecord,
    execute: () =>
      sql`
        SELECT
          integration_key AS "integrationKey",
          provider,
          access_token AS "accessToken",
          workspace_name AS "workspaceName",
          viewer_name AS "viewerName",
          viewer_email AS "viewerEmail",
          status,
          last_sync_at AS "lastSyncAt",
          updated_at AS "updatedAt",
          last_error AS "lastError"
        FROM linear_integrations
        WHERE integration_key = ${LINEAR_INTEGRATION_KEY}
      `,
  });

  const upsertLinearIntegrationRow = SqlSchema.void({
    Request: LinearIntegrationRecord,
    execute: (row) =>
      sql`
        INSERT INTO linear_integrations (
          integration_key,
          provider,
          access_token,
          workspace_name,
          viewer_name,
          viewer_email,
          status,
          last_sync_at,
          updated_at,
          last_error
        )
        VALUES (
          ${row.integrationKey},
          ${row.provider},
          ${row.accessToken},
          ${row.workspaceName},
          ${row.viewerName},
          ${row.viewerEmail},
          ${row.status},
          ${row.lastSyncAt},
          ${row.updatedAt},
          ${row.lastError}
        )
        ON CONFLICT (integration_key)
        DO UPDATE SET
          provider = excluded.provider,
          access_token = excluded.access_token,
          workspace_name = excluded.workspace_name,
          viewer_name = excluded.viewer_name,
          viewer_email = excluded.viewer_email,
          status = excluded.status,
          last_sync_at = excluded.last_sync_at,
          updated_at = excluded.updated_at,
          last_error = excluded.last_error
      `,
  });

  const clearLinearIntegrationRow = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      sql`
        DELETE FROM linear_integrations
        WHERE integration_key = ${LINEAR_INTEGRATION_KEY}
      `,
  });

  const get: LinearIntegrationRepositoryShape["get"] = () =>
    getLinearIntegrationRow(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "LinearIntegrationRepository.get:query",
          "LinearIntegrationRepository.get:decodeResult",
        ),
      ),
    );

  const upsertConnection: LinearIntegrationRepositoryShape["upsertConnection"] = (row) =>
    upsertLinearIntegrationRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "LinearIntegrationRepository.upsertConnection:query",
          "LinearIntegrationRepository.upsertConnection:encodeRequest",
        ),
      ),
    );

  const clear: LinearIntegrationRepositoryShape["clear"] = () =>
    clearLinearIntegrationRow(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "LinearIntegrationRepository.clear:query",
          "LinearIntegrationRepository.clear:encodeRequest",
        ),
      ),
    );

  return {
    get,
    upsertConnection,
    clear,
  } satisfies LinearIntegrationRepositoryShape;
});

export const LinearIntegrationRepositoryLive = Layer.effect(
  LinearIntegrationRepository,
  makeLinearIntegrationRepository,
);
