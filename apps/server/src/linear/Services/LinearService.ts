import type {
  LinearConnectInput,
  LinearConnectResult,
  LinearDisconnectResult,
  LinearGetConnectionResult,
  LinearListIssuesInput,
  LinearListIssuesResult,
  LinearListProjectsResult,
  LinearStartIssueInput,
  LinearStartIssueResult,
} from "@daize/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { LinearServiceError } from "../Errors.ts";

export interface LinearServiceShape {
  readonly getConnection: () => Effect.Effect<LinearGetConnectionResult, LinearServiceError>;
  readonly connect: (
    input: LinearConnectInput,
  ) => Effect.Effect<LinearConnectResult, LinearServiceError>;
  readonly disconnect: () => Effect.Effect<LinearDisconnectResult, LinearServiceError>;
  readonly listProjects: () => Effect.Effect<LinearListProjectsResult, LinearServiceError>;
  readonly listMyIssues: (
    input: LinearListIssuesInput,
  ) => Effect.Effect<LinearListIssuesResult, LinearServiceError>;
  readonly startIssue: (
    input: LinearStartIssueInput,
  ) => Effect.Effect<LinearStartIssueResult, LinearServiceError>;
}

export class LinearService extends ServiceMap.Service<LinearService, LinearServiceShape>()(
  "@daize.ai/cli/linear/Services/LinearService",
) {}
