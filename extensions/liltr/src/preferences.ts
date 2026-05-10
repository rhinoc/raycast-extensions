import { getPreferenceValues } from "@raycast/api";
import { AUTO_LANGUAGE_CODE, type LanguageCode, type SourceLanguageCode } from "./languages";
import type { ProviderId } from "./providers";

export type RuntimeMode = "raycast" | "liltr-app";

export type Preferences = {
  runtimeMode: RuntimeMode;
  defaultProvider: ProviderId;
  defaultSourceLanguage: SourceLanguageCode;
  primaryLanguage: LanguageCode;
  secondaryLanguage: LanguageCode;
  niutransApiKey?: string;
  baiduAppId?: string;
  baiduSecretKey?: string;
  aliAccessKeyId?: string;
  aliAccessKeySecret?: string;
  volcengineAccessKeyId?: string;
  volcengineSecretAccessKey?: string;
  ollamaApiUrl?: string;
  ollamaModel?: string;
  liltrUrlScheme?: string;
};

export function getPreferences(): Preferences {
  const preferences = getPreferenceValues<Preferences>();

  return {
    ...preferences,
    runtimeMode: preferences.runtimeMode ?? "raycast",
    defaultProvider: preferences.defaultProvider ?? "niutrans",
    defaultSourceLanguage: preferences.defaultSourceLanguage ?? AUTO_LANGUAGE_CODE,
    primaryLanguage: preferences.primaryLanguage ?? "zh-CN",
    secondaryLanguage: preferences.secondaryLanguage ?? "en-US",
    ollamaApiUrl: preferences.ollamaApiUrl?.trim() || "http://localhost:11434/api/chat",
    ollamaModel: preferences.ollamaModel?.trim() || "qwen2",
    liltrUrlScheme: preferences.liltrUrlScheme?.trim() || "liltr://translate-in-window",
  };
}
