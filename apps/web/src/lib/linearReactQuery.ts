import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

const LINEAR_CONNECTION_STALE_TIME_MS = 30_000;
const LINEAR_ISSUES_STALE_TIME_MS = 30_000;

export const linearQueryKeys = {
  all: ["linear"] as const,
  connection: () => ["linear", "connection"] as const,
  projects: () => ["linear", "projects"] as const,
  issues: () => ["linear", "issues"] as const,
};

export function invalidateLinearQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: linearQueryKeys.all });
}

export function linearConnectionQueryOptions() {
  return queryOptions({
    queryKey: linearQueryKeys.connection(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.linear.getConnection();
    },
    staleTime: LINEAR_CONNECTION_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function linearIssuesQueryOptions() {
  return queryOptions({
    queryKey: linearQueryKeys.issues(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.linear.listMyIssues({ refresh: false });
    },
    staleTime: LINEAR_ISSUES_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function linearProjectsQueryOptions() {
  return queryOptions({
    queryKey: linearQueryKeys.projects(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.linear.listProjects();
    },
    staleTime: LINEAR_ISSUES_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function linearConnectMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["linear", "mutation", "connect"] as const,
    mutationFn: async (apiKey: string) => {
      const api = ensureNativeApi();
      return api.linear.connect({ apiKey });
    },
    onSettled: () => {
      void invalidateLinearQueries(input.queryClient);
    },
  });
}

export function linearDisconnectMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["linear", "mutation", "disconnect"] as const,
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.linear.disconnect();
    },
    onSettled: () => {
      void invalidateLinearQueries(input.queryClient);
    },
  });
}
