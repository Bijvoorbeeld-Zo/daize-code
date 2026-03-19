import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import * as HttpServer from "effect/unstable/http/HttpServer";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { LinearService } from "../Services/LinearService.ts";
import { LinearServiceLive } from "./LinearService.ts";
import { LinearIntegrationRepositoryLive } from "../../persistence/Layers/LinearIntegration.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";

const linearServiceLayer = Layer.empty.pipe(
  Layer.provideMerge(LinearServiceLive),
  Layer.provideMerge(LinearIntegrationRepositoryLive),
  Layer.provideMerge(SqlitePersistenceMemory),
);

it.layer(NodeServices.layer)("LinearService", (it) => {
  it.effect("connects and lists open assigned issues", () => {
    const configLayer = ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        DAIZE_LINEAR_API_URL: "",
      }),
    );

    return Effect.gen(function* () {
      const requests: Array<{ query?: unknown }> = [];

      const apiServerLayer = HttpServer.serve(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const payload = yield* request.json.pipe(
            Effect.map((body) => body as { query?: string }),
          );
          requests.push(payload);

          if (payload.query?.includes("LinearTasksConnect")) {
            return HttpServerResponse.jsonUnsafe({
              data: {
                viewer: {
                  id: "viewer-1",
                  name: "Jane Doe",
                  email: "jane@example.com",
                },
              },
            });
          }

          return HttpServerResponse.jsonUnsafe({
            data: {
              viewer: {
                assignedIssues: {
                  nodes: [
                    {
                      id: "issue-1",
                      identifier: "ENG-123",
                      title: "Implement Linear tasks",
                      completedAt: null,
                      canceledAt: null,
                      state: {
                        name: "In Progress",
                        color: "#f59e0b",
                      },
                      assignee: {
                        name: "Jane Doe",
                      },
                    },
                    {
                      id: "issue-2",
                      identifier: "ENG-124",
                      title: "Completed issue",
                      completedAt: "2026-03-19T09:00:00.000Z",
                      canceledAt: null,
                      state: {
                        name: "Done",
                        color: "#22c55e",
                      },
                      assignee: {
                        name: "Jane Doe",
                      },
                    },
                  ],
                },
              },
            },
          });
        }),
      );

      yield* Layer.launch(apiServerLayer).pipe(Effect.forkScoped);
      const service = yield* LinearService;

      const connectResult = yield* service.connect({ apiKey: "lin_api_valid" });
      const issuesResult = yield* service.listMyIssues({ refresh: false });

      assert.strictEqual(connectResult.connection.status, "connected");
      assert.strictEqual(connectResult.connection.viewerEmail, "jane@example.com");
      assert.strictEqual(issuesResult.issues.length, 1);
      assert.strictEqual(issuesResult.issues[0]?.identifier, "ENG-123");
      assert.strictEqual(requests.length, 2);
    }).pipe(
      Effect.provide(
        linearServiceLayer.pipe(
          Layer.provide(configLayer),
          Layer.provideMerge(NodeHttpServer.layerTest),
        ),
      ),
    );
  });

  it.effect(
    "marks the persisted connection invalid after auth failures while listing issues",
    () => {
      const configLayer = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          DAIZE_LINEAR_API_URL: "",
        }),
      );

      return Effect.gen(function* () {
        const apiServerLayer = HttpServer.serve(
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const payload = yield* request.json.pipe(
              Effect.map((body) => body as { query?: string }),
            );

            if (payload.query?.includes("LinearTasksConnect")) {
              return HttpServerResponse.jsonUnsafe({
                data: {
                  viewer: {
                    id: "viewer-1",
                    name: "Jane Doe",
                    email: "jane@example.com",
                  },
                },
              });
            }

            return HttpServerResponse.empty({ status: 401 });
          }),
        );

        yield* Layer.launch(apiServerLayer).pipe(Effect.forkScoped);
        const service = yield* LinearService;

        yield* service.connect({ apiKey: "lin_api_valid" });
        const listResult = yield* Effect.exit(service.listMyIssues({ refresh: false }));
        assert.strictEqual(listResult._tag, "Failure");

        const connectionResult = yield* service.getConnection();
        assert.strictEqual(connectionResult.connection.status, "invalid");
      }).pipe(
        Effect.provide(
          linearServiceLayer.pipe(
            Layer.provide(configLayer),
            Layer.provideMerge(NodeHttpServer.layerTest),
          ),
        ),
      );
    },
  );
});
