import type { NativeApi } from "@daize/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeApi from "../nativeApi";
import {
  invalidateLinearQueries,
  linearConnectMutationOptions,
  linearConnectionQueryOptions,
  linearIssuesQueryOptions,
  linearQueryKeys,
} from "./linearReactQuery";

function mockNativeApi(input: {
  getConnection?: ReturnType<typeof vi.fn>;
  connect?: ReturnType<typeof vi.fn>;
  disconnect?: ReturnType<typeof vi.fn>;
  listMyIssues?: ReturnType<typeof vi.fn>;
}) {
  vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
    linear: {
      getConnection: input.getConnection ?? vi.fn(),
      connect: input.connect ?? vi.fn(),
      disconnect: input.disconnect ?? vi.fn(),
      listMyIssues: input.listMyIssues ?? vi.fn(),
    },
  } as unknown as NativeApi);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("linear query keys", () => {
  it("groups connection and issue queries under the linear root key", () => {
    expect(linearQueryKeys.connection().slice(0, 1)).toEqual(linearQueryKeys.all);
    expect(linearQueryKeys.issues().slice(0, 1)).toEqual(linearQueryKeys.all);
  });
});

describe("linear query options", () => {
  it("forwards connection fetches to the Linear native API", async () => {
    const getConnection = vi.fn().mockResolvedValue({
      connection: {
        status: "connected",
        workspaceName: null,
        viewerName: "Jane Doe",
        viewerEmail: "jane@example.com",
        lastSyncAt: "2026-03-19T10:00:00.000Z",
        message: null,
      },
    });
    mockNativeApi({ getConnection });

    const queryClient = new QueryClient();
    await queryClient.fetchQuery(linearConnectionQueryOptions());

    expect(getConnection).toHaveBeenCalledTimes(1);
  });

  it("loads issue lists with refresh disabled by default", async () => {
    const listMyIssues = vi.fn().mockResolvedValue({
      issues: [],
      syncedAt: "2026-03-19T10:00:00.000Z",
    });
    mockNativeApi({ listMyIssues });

    const queryClient = new QueryClient();
    await queryClient.fetchQuery(linearIssuesQueryOptions());

    expect(listMyIssues).toHaveBeenCalledWith({ refresh: false });
  });
});

describe("linear mutations", () => {
  it("invalidates cached Linear queries after connect", async () => {
    const connect = vi.fn().mockResolvedValue({
      connection: {
        status: "connected",
        workspaceName: null,
        viewerName: "Jane Doe",
        viewerEmail: "jane@example.com",
        lastSyncAt: "2026-03-19T10:00:00.000Z",
        message: null,
      },
    });
    mockNativeApi({ connect });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const mutation = linearConnectMutationOptions({ queryClient });

    const result = await (mutation.mutationFn as (apiKey: string) => Promise<unknown>)(
      "lin_api_test",
    );
    (
      mutation.onSettled as (
        data: unknown,
        error: Error | null,
        variables: string,
        onMutateResult: unknown,
        context: unknown,
      ) => void
    )(result, null, "lin_api_test", undefined, undefined);

    expect(connect).toHaveBeenCalledWith({ apiKey: "lin_api_test" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: linearQueryKeys.all });
  });

  it("exposes a shared invalidation helper", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateLinearQueries(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: linearQueryKeys.all });
  });
});
