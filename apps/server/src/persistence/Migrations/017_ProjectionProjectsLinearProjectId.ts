import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columnRows = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;

  if (columnRows.some((row) => row.name === "linear_project_id")) {
    return;
  }

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN linear_project_id TEXT
  `;
});
