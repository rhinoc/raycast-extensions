import { closeMainWindow, open } from "@raycast/api";

function normalizeText(text?: string) {
  return text?.trim() ?? "";
}

export function buildLiltrUrl(sourceText?: string, baseUrl = "liltr://translate-in-window") {
  const normalizedUrl = baseUrl.trim() || "liltr://translate-in-window";
  const normalizedText = normalizeText(sourceText);

  if (!normalizedText) {
    return normalizedUrl;
  }

  const separator = normalizedUrl.includes("?") ? "&" : "?";
  return `${normalizedUrl}${separator}src=${encodeURIComponent(normalizedText)}`;
}

export async function openLiltrApp(sourceText?: string, baseUrl?: string) {
  await closeMainWindow({ clearRootSearch: true });
  await open(buildLiltrUrl(sourceText, baseUrl));
}
