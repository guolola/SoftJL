export const USER_SETTINGS_STORAGE_KEY = "uml-lab-settings";
export const USER_SETTINGS_CHANGED_EVENT = "uml-user-settings-changed";

export type UserSettings = {
  providerConfigId: string;
  providerModelCapabilities: Record<
    string,
    {
      id?: string;
      supportsJsonSchema?: boolean;
      supportsJsonObject?: boolean;
      structuredOutputMode?: "strict_json" | "json_object" | "compatible";
      modeLabel?: string;
    }
  >;
  providerModelOptions: string[];
  providerLabel: string;
  providerDefaultModelSeededFor: string;
  defaultModel: string;
  imageModel: "gpt-image-2" | "gemini-3.1-flash-image-preview-2k" | "nano-banana-pro";
  fontSize: "sm" | "md" | "lg";
  autoGenerate: boolean;
  showStaleBanner: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  providerConfigId: "",
  providerModelCapabilities: {},
  providerModelOptions: [],
  providerLabel: "",
  providerDefaultModelSeededFor: "",
  defaultModel: "",
  imageModel: "gpt-image-2",
  fontSize: "md",
  autoGenerate: false,
  showStaleBanner: true,
};

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const next = {
      ...DEFAULT_USER_SETTINGS,
      ...JSON.parse(raw),
    };
    const sanitizedProviderModelOptions: string[] = Array.isArray(next.providerModelOptions)
      ? Array.from(
          new Set(
            next.providerModelOptions
              .map((model: unknown) => (typeof model === "string" ? model.trim() : ""))
              .filter((model: string): model is string => Boolean(model)),
          ),
        )
      : [];
    next.providerModelOptions = sanitizedProviderModelOptions;
    next.providerLabel =
      typeof next.providerLabel === "string" ? next.providerLabel.trim() : "";
    next.providerDefaultModelSeededFor =
      typeof next.providerDefaultModelSeededFor === "string"
        ? next.providerDefaultModelSeededFor.trim()
        : "";
    const sanitizedProviderModelCapabilities =
      next.providerModelCapabilities &&
      typeof next.providerModelCapabilities === "object" &&
      !Array.isArray(next.providerModelCapabilities)
        ? sanitizedProviderModelOptions.reduce<UserSettings["providerModelCapabilities"]>(
            (map, model) => {
              const rawCapability = (next.providerModelCapabilities as Record<string, unknown>)[model];
              if (!rawCapability || typeof rawCapability !== "object") return map;
              const capability = rawCapability as {
                id?: unknown;
                supportsJsonSchema?: unknown;
                supportsJsonObject?: unknown;
                structuredOutputMode?: unknown;
                modeLabel?: unknown;
              };
              const structuredOutputMode =
                capability.structuredOutputMode === "strict_json" ||
                capability.structuredOutputMode === "json_object" ||
                capability.structuredOutputMode === "compatible"
                  ? capability.structuredOutputMode
                  : capability.supportsJsonSchema === true
                    ? "strict_json"
                    : capability.supportsJsonObject === true
                      ? "json_object"
                      : "compatible";
              map[model] = {
                id: typeof capability.id === "string" ? capability.id : model,
                structuredOutputMode,
                supportsJsonSchema: structuredOutputMode === "strict_json",
                supportsJsonObject:
                  structuredOutputMode === "strict_json" ||
                  structuredOutputMode === "json_object",
                modeLabel:
                  typeof capability.modeLabel === "string" && capability.modeLabel.trim()
                    ? capability.modeLabel.trim()
                    : structuredOutputMode === "strict_json"
                      ? "严格 JSON"
                      : structuredOutputMode === "json_object"
                        ? "JSON 模式"
                        : "兼容模式",
              };
              return map;
            },
            {},
          )
        : {};
    const trimmedDefaultModel =
      typeof next.defaultModel === "string" ? next.defaultModel.trim() : "";
    if (next.providerConfigId) {
      // Preserve missing or retired selections so generation requires an explicit valid choice.
      next.defaultModel = trimmedDefaultModel;
    } else {
      next.defaultModel = "";
      next.providerModelOptions = [];
      next.providerLabel = "";
      next.providerModelCapabilities = {};
      next.providerDefaultModelSeededFor = "";
    }
    if (next.providerConfigId) {
      next.providerModelCapabilities = sanitizedProviderModelCapabilities;
    }
    const {
      providerConfigId,
      providerModelCapabilities,
      providerModelOptions,
      providerLabel,
      providerDefaultModelSeededFor,
      defaultModel,
      imageModel,
      fontSize,
      autoGenerate,
      showStaleBanner,
    } = next;
    return {
      providerConfigId,
      providerModelCapabilities,
      providerModelOptions,
      providerLabel,
      providerDefaultModelSeededFor,
      defaultModel,
      imageModel,
      fontSize,
      autoGenerate,
      showStaleBanner,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings) {
  localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(USER_SETTINGS_CHANGED_EVENT));
}

export function patchUserSettings(patch: Partial<UserSettings>) {
  saveUserSettings({
    ...loadUserSettings(),
    ...patch,
  });
}
