import { useCallback } from "react";
import { Option, Schema } from "effect";
import { TrimmedNonEmptyString, type ProviderKind } from "@daize/contracts";
import {
  getDefaultModel,
  getModelOptions,
  inferProviderForModel,
  normalizeModelSlug,
} from "@daize/shared/model";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { EnvMode } from "./components/BranchToolbar.logic";

const APP_SETTINGS_STORAGE_KEY = "daize:app-settings:v1";
const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;

export const TimestampFormat = Schema.Literals(["locale", "12-hour", "24-hour"]);
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";

const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  codex: new Set(getModelOptions("codex").map((option) => option.slug)),
  claudeAgent: new Set(getModelOptions("claudeAgent").map((option) => option.slug)),
};

const withDefaults =
  <
    S extends Schema.Top & Schema.WithoutConstructorDefault,
    D extends S["~type.make.in"] & S["Encoded"],
  >(
    fallback: () => D,
  ) =>
  (schema: S) =>
    schema.pipe(
      Schema.withConstructorDefault(() => Option.some(fallback())),
      Schema.withDecodingDefault(() => fallback()),
    );

export const AppSettingsSchema = Schema.Struct({
  codexBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  codexHomePath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  defaultThreadEnvMode: EnvMode.pipe(withDefaults(() => "local" as const satisfies EnvMode)),
  confirmThreadDelete: Schema.Boolean.pipe(withDefaults(() => true)),
  enableAssistantStreaming: Schema.Boolean.pipe(withDefaults(() => false)),
  timestampFormat: TimestampFormat.pipe(withDefaults(() => DEFAULT_TIMESTAMP_FORMAT)),
  customCodexModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customClaudeModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  defaultModel: Schema.optional(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(() => undefined),
  ),
  // Legacy key kept for localStorage migration from the old task-specific preference.
  taskStartModel: Schema.optional(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(() => undefined),
  ),
  textGenerationModel: Schema.optional(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(() => undefined),
  ),
});
export type AppSettings = typeof AppSettingsSchema.Type;
export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

export interface AppModelOptionGroup {
  provider: ProviderKind;
  label: string;
  options: AppModelOption[];
}

const APP_MODEL_GROUP_LABELS: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
};

const DEFAULT_APP_SETTINGS = AppSettingsSchema.makeUnsafe({});

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind = "codex",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();
  const builtInModelSlugs = BUILT_IN_MODEL_SLUGS_BY_PROVIDER[provider];

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const normalizedDefaultModel = (() => {
    const candidate = settings.defaultModel ?? settings.taskStartModel;
    const provider = inferProviderForModel(candidate);
    return normalizeModelSlug(candidate, provider) ?? undefined;
  })();
  const normalizedTextGenerationModel = (() => {
    const provider = inferProviderForModel(settings.textGenerationModel);
    return normalizeModelSlug(settings.textGenerationModel, provider) ?? undefined;
  })();

  return {
    ...settings,
    customCodexModels: normalizeCustomModelSlugs(settings.customCodexModels, "codex"),
    customClaudeModels: normalizeCustomModelSlugs(settings.customClaudeModels, "claudeAgent"),
    defaultModel: normalizedDefaultModel,
    taskStartModel: undefined,
    textGenerationModel: normalizedTextGenerationModel,
  };
}
export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getModelOptions(provider).map(({ slug, name }) => ({
    slug,
    name,
    isCustom: false,
  }));
  const seen = new Set(options.map((option) => option.slug));

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      slug,
      name: slug,
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (normalizedSelectedModel && !seen.has(normalizedSelectedModel)) {
    options.push({
      slug: normalizedSelectedModel,
      name: normalizedSelectedModel,
      isCustom: true,
    });
  }

  return options;
}

export function getAppModelOptionsByProvider(input: {
  customCodexModels: readonly string[];
  customClaudeModels: readonly string[];
  selectedModel?: string | null | undefined;
}): Record<ProviderKind, AppModelOption[]> {
  const selectedProvider = inferProviderForModel(input.selectedModel);
  return {
    codex: getAppModelOptions(
      "codex",
      input.customCodexModels,
      selectedProvider === "codex" ? input.selectedModel : undefined,
    ),
    claudeAgent: getAppModelOptions(
      "claudeAgent",
      input.customClaudeModels,
      selectedProvider === "claudeAgent" ? input.selectedModel : undefined,
    ),
  };
}

export function getAppModelOptionGroups(input: {
  customCodexModels: readonly string[];
  customClaudeModels: readonly string[];
  selectedModel?: string | null | undefined;
}): AppModelOptionGroup[] {
  const optionsByProvider = getAppModelOptionsByProvider(input);
  return (["codex", "claudeAgent"] as const).map((provider) => ({
    provider,
    label: APP_MODEL_GROUP_LABELS[provider],
    options: optionsByProvider[provider],
  }));
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel: string | null | undefined,
): string {
  const options = getAppModelOptions(provider, customModels, selectedModel);
  const trimmedSelectedModel = selectedModel?.trim();
  if (trimmedSelectedModel) {
    const direct = options.find((option) => option.slug === trimmedSelectedModel);
    if (direct) {
      return direct.slug;
    }

    const byName = options.find(
      (option) => option.name.toLowerCase() === trimmedSelectedModel.toLowerCase(),
    );
    if (byName) {
      return byName.slug;
    }
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (!normalizedSelectedModel) {
    return getDefaultModel(provider);
  }

  return (
    options.find((option) => option.slug === normalizedSelectedModel)?.slug ??
    getDefaultModel(provider)
  );
}

export function resolveThreadStartModelSelection(input: {
  selectedModel: string | null | undefined;
  projectModel: string | null | undefined;
  customCodexModels: readonly string[];
  customClaudeModels: readonly string[];
}): { provider: ProviderKind; model: string } {
  const projectProvider = inferProviderForModel(input.projectModel);
  const provider = inferProviderForModel(input.selectedModel, projectProvider);
  const model = resolveAppModelSelection(
    provider,
    provider === "claudeAgent" ? input.customClaudeModels : input.customCodexModels,
    input.selectedModel ?? input.projectModel,
  );

  return { provider, model };
}

export function useAppSettings() {
  const [settings, setSettings] = useLocalStorage(
    APP_SETTINGS_STORAGE_KEY,
    DEFAULT_APP_SETTINGS,
    AppSettingsSchema,
  );
  const normalizedSettings = normalizeAppSettings(settings);
  const normalizedDefaults = normalizeAppSettings(DEFAULT_APP_SETTINGS);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => normalizeAppSettings({ ...normalizeAppSettings(prev), ...patch }));
    },
    [setSettings],
  );

  const resetSettings = useCallback(() => {
    setSettings(normalizedDefaults);
  }, [normalizedDefaults, setSettings]);

  return {
    settings: normalizedSettings,
    updateSettings,
    resetSettings,
    defaults: normalizedDefaults,
  } as const;
}
