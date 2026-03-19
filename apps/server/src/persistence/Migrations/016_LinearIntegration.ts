import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

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
  `;
});
