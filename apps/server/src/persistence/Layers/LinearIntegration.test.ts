import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { LinearIntegrationRepositoryLive } from "./LinearIntegration.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { LinearIntegrationRepository } from "../Services/LinearIntegration.ts";

const linearIntegrationLayer = LinearIntegrationRepositoryLive.pipe(
  Layer.provide(SqlitePersistenceMemory),
);

it.effect("stores and clears the persisted Linear integration row", () =>
  Effect.gen(function* () {
    const repository = yield* LinearIntegrationRepository;

    const initial = yield* repository.get();
    assert.strictEqual(initial._tag, "None");

    yield* repository.upsertConnection({
      integrationKey: "linear",
      provider: "linear",
      accessToken: "lin_api_test",
      workspaceName: null,
      viewerName: "Jane Doe",
      viewerEmail: "jane@example.com",
      status: "connected",
      lastSyncAt: "2026-03-19T10:00:00.000Z",
      updatedAt: "2026-03-19T10:00:00.000Z",
      lastError: null,
    });

    const stored = yield* repository.get();
    assert.strictEqual(stored._tag, "Some");
    if (stored._tag === "Some") {
      assert.strictEqual(stored.value.viewerEmail, "jane@example.com");
      assert.strictEqual(stored.value.accessToken, "lin_api_test");
    }

    yield* repository.clear();

    const cleared = yield* repository.get();
    assert.strictEqual(cleared._tag, "None");
  }).pipe(Effect.provide(linearIntegrationLayer)),
);
