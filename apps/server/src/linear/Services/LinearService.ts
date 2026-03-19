import type {
  LinearConnectInput,
  LinearConnectResult,
  LinearDisconnectResult,
  LinearGetConnectionResult,
  LinearListIssuesInput,
  LinearListIssuesResult,
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
  readonly listMyIssues: (
    input: LinearListIssuesInput,
  ) => Effect.Effect<LinearListIssuesResult, LinearServiceError>;
}

export class LinearService extends ServiceMap.Service<LinearService, LinearServiceShape>()(
  "@daize.ai/cli/linear/Services/LinearService",
) {}
