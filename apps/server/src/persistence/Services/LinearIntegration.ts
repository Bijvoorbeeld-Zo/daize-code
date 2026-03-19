import { LinearConnectionStatus, type IsoDateTime } from "@daize/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const LinearIntegrationRecord = Schema.Struct({
  integrationKey: Schema.Literal("linear"),
  provider: Schema.Literal("linear"),
  accessToken: Schema.NullOr(Schema.String),
  workspaceName: Schema.NullOr(Schema.String),
  viewerName: Schema.NullOr(Schema.String),
  viewerEmail: Schema.NullOr(Schema.String),
  status: LinearConnectionStatus,
  lastSyncAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  lastError: Schema.NullOr(Schema.String),
});
export type LinearIntegrationRecord = Omit<
  typeof LinearIntegrationRecord.Type,
  "lastSyncAt" | "updatedAt"
> & {
  lastSyncAt: IsoDateTime | null;
  updatedAt: IsoDateTime;
};

export interface LinearIntegrationRepositoryShape {
  readonly get: () => Effect.Effect<
    Option.Option<LinearIntegrationRecord>,
    ProjectionRepositoryError
  >;
  readonly upsertConnection: (
    row: LinearIntegrationRecord,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly clear: () => Effect.Effect<void, ProjectionRepositoryError>;
}

export class LinearIntegrationRepository extends ServiceMap.Service<
  LinearIntegrationRepository,
  LinearIntegrationRepositoryShape
>()("daize/persistence/Services/LinearIntegration/LinearIntegrationRepository") {}
