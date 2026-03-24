import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

const SKILLS_STALE_TIME_MS = 30_000;

export const skillsQueryKeys = {
  all: ["skills"] as const,
  list: () => ["skills", "list"] as const,
  search: (query: string) => ["skills", "search", query] as const,
};

export function invalidateSkillsQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: skillsQueryKeys.all });
}

export function skillsListQueryOptions() {
  return queryOptions({
    queryKey: skillsQueryKeys.list(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.skills.list();
    },
    staleTime: SKILLS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function skillsSearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: skillsQueryKeys.search(query),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.skills.search({ query });
    },
    staleTime: SKILLS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
}

export function installSkillMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["skills", "mutation", "install"] as const,
    mutationFn: async (slug: string) => {
      const api = ensureNativeApi();
      return api.skills.install({ slug });
    },
    onSettled: () => {
      void invalidateSkillsQueries(input.queryClient);
    },
  });
}

export function installSearchSkillMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["skills", "mutation", "install-search"] as const,
    mutationFn: async (skill: { installRef: string; slug: string }) => {
      const api = ensureNativeApi();
      return api.skills.installSearch(skill);
    },
    onSettled: () => {
      void invalidateSkillsQueries(input.queryClient);
    },
  });
}

export function createSkillMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["skills", "mutation", "create"] as const,
    mutationFn: async (skill: { name: string; description?: string }) => {
      const api = ensureNativeApi();
      return api.skills.create(skill);
    },
    onSettled: () => {
      void invalidateSkillsQueries(input.queryClient);
    },
  });
}
