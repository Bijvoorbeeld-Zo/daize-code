import { Schema } from "effect";

export class LinearNotConnectedError extends Schema.TaggedErrorClass<LinearNotConnectedError>()(
  "LinearNotConnectedError",
  {
    detail: Schema.String,
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export class LinearAuthError extends Schema.TaggedErrorClass<LinearAuthError>()("LinearAuthError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return this.detail;
  }
}

export class LinearApiError extends Schema.TaggedErrorClass<LinearApiError>()("LinearApiError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return this.detail;
  }
}

export class LinearPersistenceError extends Schema.TaggedErrorClass<LinearPersistenceError>()(
  "LinearPersistenceError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return this.detail;
  }
}

export type LinearServiceError =
  | LinearNotConnectedError
  | LinearAuthError
  | LinearApiError
  | LinearPersistenceError;
