import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

export const LinearConnectionStatus = Schema.Literals([
  "disconnected",
  "connected",
  "invalid",
  "error",
]);
export type LinearConnectionStatus = typeof LinearConnectionStatus.Type;

export const LinearIssueStatus = Schema.Struct({
  name: TrimmedNonEmptyString,
  color: Schema.NullOr(TrimmedNonEmptyString),
});
export type LinearIssueStatus = typeof LinearIssueStatus.Type;

export const LinearIssueSummary = Schema.Struct({
  id: TrimmedNonEmptyString,
  identifier: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  status: LinearIssueStatus,
  assigneeName: Schema.NullOr(TrimmedNonEmptyString),
});
export type LinearIssueSummary = typeof LinearIssueSummary.Type;

export const LinearConnectionSummary = Schema.Struct({
  status: LinearConnectionStatus,
  workspaceName: Schema.NullOr(TrimmedNonEmptyString),
  viewerName: Schema.NullOr(TrimmedNonEmptyString),
  viewerEmail: Schema.NullOr(TrimmedNonEmptyString),
  lastSyncAt: Schema.NullOr(IsoDateTime),
  message: Schema.NullOr(TrimmedNonEmptyString),
});
export type LinearConnectionSummary = typeof LinearConnectionSummary.Type;

export const LinearListIssuesInput = Schema.Struct({
  refresh: Schema.optional(Schema.Boolean).pipe(Schema.withDecodingDefault(() => false)),
});
export type LinearListIssuesInput = typeof LinearListIssuesInput.Type;

export const LinearListIssuesResult = Schema.Struct({
  issues: Schema.Array(LinearIssueSummary),
  syncedAt: IsoDateTime,
});
export type LinearListIssuesResult = typeof LinearListIssuesResult.Type;

export const LinearConnectInput = Schema.Struct({
  apiKey: TrimmedNonEmptyString.check(Schema.isMaxLength(4096)),
});
export type LinearConnectInput = typeof LinearConnectInput.Type;

export const LinearConnectResult = Schema.Struct({
  connection: LinearConnectionSummary,
});
export type LinearConnectResult = typeof LinearConnectResult.Type;

export const LinearDisconnectResult = Schema.Struct({
  connection: LinearConnectionSummary,
});
export type LinearDisconnectResult = typeof LinearDisconnectResult.Type;

export const LinearGetConnectionResult = Schema.Struct({
  connection: LinearConnectionSummary,
});
export type LinearGetConnectionResult = typeof LinearGetConnectionResult.Type;
