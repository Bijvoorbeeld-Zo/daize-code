import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

const SKILL_PATH_MAX_LENGTH = 2048;

export const SkillSource = Schema.Literals(["user", "bundled"]);
export type SkillSource = typeof SkillSource.Type;

export const SkillInstallAgent = Schema.Literals(["codex", "claude-code"]);
export type SkillInstallAgent = typeof SkillInstallAgent.Type;

export const InstalledSkill = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString.check(Schema.isMaxLength(SKILL_PATH_MAX_LENGTH)),
  source: SkillSource,
  installedFor: Schema.Array(SkillInstallAgent),
  originLabel: Schema.optional(TrimmedNonEmptyString),
});
export type InstalledSkill = typeof InstalledSkill.Type;

export const RecommendedSkill = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  originLabel: Schema.optional(TrimmedNonEmptyString),
});
export type RecommendedSkill = typeof RecommendedSkill.Type;

export const SearchSkill = Schema.Struct({
  slug: TrimmedNonEmptyString,
  installRef: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  installsLabel: Schema.optional(TrimmedNonEmptyString),
  originLabel: Schema.optional(TrimmedNonEmptyString),
});
export type SearchSkill = typeof SearchSkill.Type;

export const SkillsListResult = Schema.Struct({
  installedSkills: Schema.Array(InstalledSkill),
  recommendedSkills: Schema.Array(RecommendedSkill),
  trendingError: Schema.optional(TrimmedNonEmptyString),
  syncedAt: TrimmedNonEmptyString,
});
export type SkillsListResult = typeof SkillsListResult.Type;

export const SkillsSearchInput = Schema.Struct({
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
});
export type SkillsSearchInput = typeof SkillsSearchInput.Type;

export const SkillsSearchResult = Schema.Struct({
  skills: Schema.Array(SearchSkill),
});
export type SkillsSearchResult = typeof SkillsSearchResult.Type;

export const SkillsInstallInput = Schema.Struct({
  slug: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
});
export type SkillsInstallInput = typeof SkillsInstallInput.Type;

export const SkillsInstallResult = Schema.Struct({
  skill: InstalledSkill,
  created: Schema.Boolean,
});
export type SkillsInstallResult = typeof SkillsInstallResult.Type;

export const SkillsInstallSearchInput = Schema.Struct({
  installRef: TrimmedNonEmptyString,
  slug: TrimmedNonEmptyString,
});
export type SkillsInstallSearchInput = typeof SkillsInstallSearchInput.Type;

export const SkillsInstallSearchResult = Schema.Struct({
  skill: InstalledSkill,
  created: Schema.Boolean,
});
export type SkillsInstallSearchResult = typeof SkillsInstallSearchResult.Type;

export const SkillsCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  description: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(240))),
});
export type SkillsCreateInput = typeof SkillsCreateInput.Type;

export const SkillsCreateResult = Schema.Struct({
  skill: InstalledSkill,
  created: Schema.Boolean,
});
export type SkillsCreateResult = typeof SkillsCreateResult.Type;
