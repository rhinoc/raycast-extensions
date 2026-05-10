import {
  Action,
  ActionPanel,
  getSelectedText,
  Icon,
  Keyboard,
  List,
  LocalStorage,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { openLiltrApp } from "./liltr-app";
import {
  AUTO_LANGUAGE_CODE,
  getLanguageByCode,
  getLanguageLabel,
  getSourceLanguageLabel,
  languages,
  type LanguageCode,
  type SourceLanguageCode,
} from "./languages";
import { getPreferences } from "./preferences";
import { getProviderById, getProviders, translateText, type ProviderId, type TranslationResult } from "./providers";

type TranslateCommandProps = {
  initialText?: string;
  loadSelectedTextOnMount?: boolean;
};

type TranslationState = {
  result?: TranslationResult;
  error?: string;
};

type TranslationHistoryEntry = {
  id: string;
  createdAt: string;
  fingerprint: string;
  sourceText: string;
  result: TranslationResult;
};

const CURRENT_ITEM_ID = "current";
const HISTORY_STORAGE_KEY = "translation-history-v1";
const MAX_HISTORY_ITEMS = 200;

function markdownEscape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/([`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

function shortenText(text: string, maxLength = 80) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function buildLanguagePairText(
  result?: TranslationResult,
  sourceLanguageCode?: SourceLanguageCode,
  targetLanguageCode?: LanguageCode,
) {
  if (result) {
    return `${result.sourceLanguage.flag} ${result.sourceLanguage.shortCode} → ${result.targetLanguage.flag} ${result.targetLanguage.shortCode}`;
  }

  if (!sourceLanguageCode || !targetLanguageCode) {
    return "";
  }

  return `${getSourceLanguageLabel(sourceLanguageCode)} → ${getLanguageLabel(targetLanguageCode)}`;
}

function buildHistoryFingerprint(sourceText: string, result: TranslationResult) {
  return [
    compactText(sourceText),
    result.text.trim(),
    result.provider.id,
    result.sourceLanguage.code,
    result.targetLanguage.code,
  ].join("__");
}

function parseHistoryEntries(value?: string): TranslationHistoryEntry[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry): entry is TranslationHistoryEntry => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        const item = entry as Partial<TranslationHistoryEntry>;
        return Boolean(
          typeof item.id === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.fingerprint === "string" &&
          typeof item.sourceText === "string" &&
          item.result &&
          typeof item.result.text === "string" &&
          typeof item.result.provider?.id === "string" &&
          typeof item.result.provider?.title === "string" &&
          typeof item.result.sourceLanguage?.code === "string" &&
          typeof item.result.targetLanguage?.code === "string",
        );
      })
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

async function persistHistoryEntries(entries: TranslationHistoryEntry[]) {
  if (entries.length === 0) {
    await LocalStorage.removeItem(HISTORY_STORAGE_KEY);
    return;
  }

  await LocalStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

export function TranslateCommand(props: TranslateCommandProps) {
  const preferences = useMemo(() => getPreferences(), []);
  const isLegacyMode = preferences.runtimeMode === "liltr-app";
  const [sourceText, setSourceText] = useState(props.initialText ?? "");
  const [sourceLanguageCode, setSourceLanguageCode] = useState<SourceLanguageCode>(preferences.defaultSourceLanguage);
  const [targetLanguageCode, setTargetLanguageCode] = useState<LanguageCode>(preferences.primaryLanguage);
  const [providerId, setProviderId] = useState<ProviderId>(preferences.defaultProvider);
  const [isPreparing, setIsPreparing] = useState(Boolean(props.loadSelectedTextOnMount));
  const [isTranslating, setIsTranslating] = useState(false);
  const [state, setState] = useState<TranslationState>({});
  const [historyEntries, setHistoryEntries] = useState<TranslationHistoryEntry[]>([]);
  const [selectedItemId, setSelectedItemId] = useState(CURRENT_ITEM_ID);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (isLegacyMode) {
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      const storedHistory = await LocalStorage.getItem<string>(HISTORY_STORAGE_KEY);
      if (!cancelled) {
        setHistoryEntries(parseHistoryEntries(storedHistory));
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [isLegacyMode]);

  useEffect(() => {
    if (!props.loadSelectedTextOnMount) {
      return;
    }

    let cancelled = false;

    async function loadSelectedText() {
      try {
        const selectedText = (await getSelectedText()).trim();
        if (!cancelled) {
          setSourceText(selectedText);
          setSelectedItemId(CURRENT_ITEM_ID);
        }

        if (selectedText && isLegacyMode) {
          await openLiltrApp(selectedText, preferences.liltrUrlScheme);
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error.message : "Unable to use selected text from the frontmost app.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    }

    void loadSelectedText();

    return () => {
      cancelled = true;
    };
  }, [isLegacyMode, preferences.liltrUrlScheme, props.loadSelectedTextOnMount]);

  useEffect(() => {
    if (isLegacyMode) {
      setIsTranslating(false);
      setState({});
      return;
    }

    const trimmedText = sourceText.trim();
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!trimmedText) {
      setIsTranslating(false);
      setState({});
      return;
    }

    const timeout = setTimeout(async () => {
      setIsTranslating(true);

      try {
        const result = await translateText({
          text: trimmedText,
          sourceLanguageCode,
          targetLanguageCode,
          providerId,
          preferences,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setState({ result });
        setTargetLanguageCode(result.targetLanguage.code);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setState({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsTranslating(false);
        }
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [isLegacyMode, preferences, providerId, sourceLanguageCode, sourceText, targetLanguageCode]);

  useEffect(() => {
    if (isLegacyMode || !state.result || !sourceText.trim()) {
      return;
    }

    const entry: TranslationHistoryEntry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      fingerprint: buildHistoryFingerprint(sourceText, state.result),
      sourceText: sourceText.trim(),
      result: state.result,
    };

    setHistoryEntries((previousEntries) => {
      const nextEntries = [entry, ...previousEntries.filter((item) => item.fingerprint !== entry.fingerprint)].slice(
        0,
        MAX_HISTORY_ITEMS,
      );
      void persistHistoryEntries(nextEntries);
      return nextEntries;
    });
  }, [isLegacyMode, sourceText, state.result]);

  const activeProvider = getProviderById(providerId);
  const selectedHistoryEntry =
    !isLegacyMode && selectedItemId !== CURRENT_ITEM_ID
      ? historyEntries.find((entry) => entry.id === selectedItemId)
      : undefined;
  const selectedSourceText = selectedHistoryEntry?.sourceText ?? sourceText;
  const selectedResult = selectedHistoryEntry?.result ?? state.result;
  const selectedError = selectedHistoryEntry ? undefined : state.error;
  const selectedLanguagePairText = buildLanguagePairText(selectedResult, sourceLanguageCode, targetLanguageCode);

  const detailMarkdown = buildDetailMarkdown({
    runtimeMode: preferences.runtimeMode,
    sourceText: selectedSourceText,
    result: selectedResult,
    error: selectedError,
    isPreparing,
    hasHistory: historyEntries.length > 0,
    isHistorySelection: Boolean(selectedHistoryEntry),
  });

  const currentTitle = sourceText.trim()
    ? shortenText(compactText(sourceText), 88)
    : isLegacyMode
      ? "Open liltr"
      : "Start typing";
  const currentSubtitle = sourceText.trim()
    ? isLegacyMode
      ? "Press Enter to open"
      : state.error
        ? "Translation failed"
        : state.result?.text
          ? shortenText(compactText(state.result.text), 96)
          : "Translating…"
    : undefined;

  function handleSourceTextChange(nextText: string) {
    setSelectedItemId(CURRENT_ITEM_ID);
    setSourceText(nextText);
    setState({});
  }

  async function pasteSelectedText() {
    try {
      const selectedText = (await getSelectedText()).trim();
      setSelectedItemId(CURRENT_ITEM_ID);
      setSourceText(selectedText);
      setState({});

      if (selectedText && isLegacyMode) {
        await openLiltrApp(selectedText, preferences.liltrUrlScheme);
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to use selected text",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleSwapLanguages() {
    const resolvedSourceLanguage = state.result?.sourceLanguage ?? getLanguageByCode(preferences.secondaryLanguage);
    const resolvedTargetLanguage = state.result?.targetLanguage ?? getLanguageByCode(targetLanguageCode);
    const nextSourceText = state.result?.text || sourceText;

    setSelectedItemId(CURRENT_ITEM_ID);
    setSourceText(nextSourceText);
    setSourceLanguageCode(resolvedTargetLanguage.code);
    setTargetLanguageCode(resolvedSourceLanguage.code);
    setState({});
  }

  async function handleOpenLiltr() {
    try {
      await openLiltrApp(selectedSourceText, preferences.liltrUrlScheme);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unable to open liltr",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleApplyHistoryEntry(entry: TranslationHistoryEntry) {
    setSelectedItemId(CURRENT_ITEM_ID);
    setSourceText(entry.sourceText);
    setSourceLanguageCode(entry.result.sourceLanguage.code);
    setTargetLanguageCode(entry.result.targetLanguage.code);
    setProviderId(entry.result.provider.id);
    setState({ result: entry.result });
  }

  function handleRemoveHistoryEntry(entryId: string) {
    setSelectedItemId(CURRENT_ITEM_ID);
    setHistoryEntries((previousEntries) => {
      const nextEntries = previousEntries.filter((entry) => entry.id !== entryId);
      void persistHistoryEntries(nextEntries);
      return nextEntries;
    });
  }

  return (
    <List
      isLoading={isPreparing || (!isLegacyMode && isTranslating)}
      isShowingDetail
      navigationTitle="liltr"
      selectedItemId={selectedItemId}
      onSelectionChange={(itemId) => setSelectedItemId(itemId ?? CURRENT_ITEM_ID)}
      searchBarPlaceholder={isLegacyMode ? "Type to open liltr" : "Type to translate"}
      searchText={isPreparing ? "" : sourceText}
      onSearchTextChange={isPreparing ? undefined : handleSourceTextChange}
      searchBarAccessory={
        isLegacyMode ? undefined : (
          <List.Dropdown
            tooltip="Target Language"
            value={targetLanguageCode}
            onChange={(value) => {
              setSelectedItemId(CURRENT_ITEM_ID);
              setTargetLanguageCode(value as LanguageCode);
              setState({});
            }}
          >
            {languages.map((language) => (
              <List.Dropdown.Item
                key={language.code}
                title={`${language.flag} ${language.name}`}
                value={language.code}
              />
            ))}
          </List.Dropdown>
        )
      }
    >
      <List.Section title={isLegacyMode ? "Input" : "Current"}>
        <List.Item
          id={CURRENT_ITEM_ID}
          icon={Icon.Text}
          title={currentTitle}
          subtitle={currentSubtitle}
          accessories={
            isLegacyMode
              ? [{ text: sourceText.trim() ? "Press Enter to Open" : "Type anything..." }]
              : selectedLanguagePairText && sourceText.trim()
                ? [{ text: selectedLanguagePairText }]
                : []
          }
          detail={
            <List.Item.Detail
              markdown={detailMarkdown}
              metadata={
                selectedSourceText.trim() ? (
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Original" text={selectedSourceText.trim()} />
                    {!isLegacyMode && selectedResult ? (
                      <>
                        <List.Item.Detail.Metadata.Label
                          title="Languages"
                          text={`${selectedResult.sourceLanguage.flag} ${selectedResult.sourceLanguage.name} → ${selectedResult.targetLanguage.flag} ${selectedResult.targetLanguage.name}`}
                        />
                        <List.Item.Detail.Metadata.Label title="Provider" text={activeProvider.title} />
                      </>
                    ) : !isLegacyMode ? (
                      <>
                        <List.Item.Detail.Metadata.Label
                          title="Source"
                          text={getSourceLanguageLabel(sourceLanguageCode)}
                        />
                        <List.Item.Detail.Metadata.Label title="Target" text={getLanguageLabel(targetLanguageCode)} />
                        <List.Item.Detail.Metadata.Label title="Provider" text={activeProvider.title} />
                      </>
                    ) : null}
                  </List.Item.Detail.Metadata>
                ) : undefined
              }
            />
          }
          actions={
            <ActionPanel>
              {isLegacyMode ? (
                <Action
                  title="Open in Liltr App"
                  icon={Icon.AppWindow}
                  onAction={handleOpenLiltr}
                  shortcut={Keyboard.Shortcut.Common.Open}
                />
              ) : selectedResult ? (
                <Action.CopyToClipboard
                  title="Copy Translation"
                  content={selectedResult.text}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                />
              ) : null}
              <Action.CopyToClipboard
                title="Copy Source Text"
                content={selectedSourceText}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
              {!isLegacyMode && !selectedHistoryEntry ? (
                <Action
                  title="Swap Languages"
                  icon={Icon.ArrowClockwise}
                  onAction={handleSwapLanguages}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                />
              ) : null}
              {selectedHistoryEntry ? (
                <Action
                  title="Use as Current Input"
                  icon={Icon.ArrowRight}
                  onAction={() => handleApplyHistoryEntry(selectedHistoryEntry)}
                  shortcut={Keyboard.Shortcut.Common.Open}
                />
              ) : null}
              <Action
                title="Use Selected Text"
                icon={Icon.TextSelection}
                onAction={pasteSelectedText}
                shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
              />
              {!isLegacyMode ? (
                <Action
                  title="Open in Liltr App"
                  icon={Icon.AppWindow}
                  onAction={handleOpenLiltr}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                />
              ) : null}
              {!selectedHistoryEntry ? (
                <Action
                  title="Clear Text"
                  icon={Icon.XMarkCircle}
                  onAction={() => {
                    setSelectedItemId(CURRENT_ITEM_ID);
                    setSourceText("");
                    setState({});
                  }}
                  shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                />
              ) : (
                <Action
                  title="Remove from History"
                  icon={Icon.Trash}
                  onAction={() => handleRemoveHistoryEntry(selectedHistoryEntry.id)}
                  shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                />
              )}
              {!isLegacyMode && !selectedHistoryEntry ? (
                <ActionPanel.Submenu title={`Source: ${getSourceLanguageLabel(sourceLanguageCode)}`} icon={Icon.Globe}>
                  <Action
                    title="Auto Detect"
                    icon={sourceLanguageCode === AUTO_LANGUAGE_CODE ? Icon.CheckCircle : Icon.Circle}
                    onAction={() => {
                      setSelectedItemId(CURRENT_ITEM_ID);
                      setSourceLanguageCode(AUTO_LANGUAGE_CODE);
                      setState({});
                    }}
                  />
                  {languages.map((language) => (
                    <Action
                      key={language.code}
                      title={`${language.flag} ${language.name}`}
                      icon={sourceLanguageCode === language.code ? Icon.CheckCircle : Icon.Circle}
                      onAction={() => {
                        setSelectedItemId(CURRENT_ITEM_ID);
                        setSourceLanguageCode(language.code);
                        setState({});
                      }}
                    />
                  ))}
                </ActionPanel.Submenu>
              ) : null}
              {!isLegacyMode && !selectedHistoryEntry ? (
                <ActionPanel.Submenu title={`Target: ${getLanguageLabel(targetLanguageCode)}`} icon={Icon.Globe}>
                  {languages.map((language) => (
                    <Action
                      key={language.code}
                      title={`${language.flag} ${language.name}`}
                      icon={targetLanguageCode === language.code ? Icon.CheckCircle : Icon.Circle}
                      onAction={() => {
                        setSelectedItemId(CURRENT_ITEM_ID);
                        setTargetLanguageCode(language.code);
                        setState({});
                      }}
                    />
                  ))}
                </ActionPanel.Submenu>
              ) : null}
              {!isLegacyMode && !selectedHistoryEntry ? (
                <ActionPanel.Submenu title={`Provider: ${activeProvider.title}`} icon={Icon.Network}>
                  {getProviders().map((provider) => (
                    <Action
                      key={provider.id}
                      title={provider.title}
                      icon={providerId === provider.id ? Icon.CheckCircle : Icon.Circle}
                      onAction={() => {
                        setSelectedItemId(CURRENT_ITEM_ID);
                        setProviderId(provider.id);
                        setState({});
                      }}
                    />
                  ))}
                </ActionPanel.Submenu>
              ) : null}
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      </List.Section>

      {!isLegacyMode && historyEntries.length > 0 ? (
        <List.Section title="Recent">
          {historyEntries.map((entry) => (
            <List.Item
              key={entry.id}
              id={entry.id}
              icon={Icon.Clock}
              title={shortenText(compactText(entry.sourceText), 88)}
              subtitle={shortenText(compactText(entry.result.text), 88)}
              accessories={[{ text: buildLanguagePairText(entry.result) }]}
              detail={
                <List.Item.Detail
                  markdown={buildDetailMarkdown({
                    runtimeMode: preferences.runtimeMode,
                    sourceText: entry.sourceText,
                    result: entry.result,
                    isPreparing: false,
                    hasHistory: historyEntries.length > 0,
                    isHistorySelection: true,
                  })}
                  metadata={
                    entry.sourceText.trim() ? (
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label title="Original" text={entry.sourceText.trim()} />
                        <List.Item.Detail.Metadata.Label
                          title="Languages"
                          text={`${entry.result.sourceLanguage.flag} ${entry.result.sourceLanguage.name} → ${entry.result.targetLanguage.flag} ${entry.result.targetLanguage.name}`}
                        />
                        <List.Item.Detail.Metadata.Label title="Provider" text={entry.result.provider.title} />
                      </List.Item.Detail.Metadata>
                    ) : undefined
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Use as Current Input"
                    icon={Icon.ArrowRight}
                    onAction={() => handleApplyHistoryEntry(entry)}
                    shortcut={Keyboard.Shortcut.Common.Open}
                  />
                  <Action.CopyToClipboard
                    title="Copy Translation"
                    content={entry.result.text}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                  <Action.CopyToClipboard
                    title="Copy Source Text"
                    content={entry.sourceText}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <Action
                    title="Open in Liltr App"
                    icon={Icon.AppWindow}
                    onAction={() => openLiltrApp(entry.sourceText, preferences.liltrUrlScheme)}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  />
                  <Action
                    title="Remove from History"
                    icon={Icon.Trash}
                    onAction={() => handleRemoveHistoryEntry(entry.id)}
                    shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                  />
                  <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

function buildDetailMarkdown(props: {
  runtimeMode: "raycast" | "liltr-app";
  sourceText: string;
  result?: TranslationResult;
  error?: string;
  isPreparing: boolean;
  hasHistory: boolean;
  isHistorySelection: boolean;
}) {
  if (props.isPreparing) {
    return "Loading selected text…";
  }

  if (!props.sourceText.trim()) {
    if (props.runtimeMode === "liltr-app") {
      return "_Type to open liltr_";
    }

    return props.hasHistory ? "_Type to translate or pick a recent item_" : "_Type to translate_";
  }

  if (props.error) {
    return ["# Translation Failed", "", props.error].join("\n");
  }

  if (props.runtimeMode === "liltr-app") {
    return ["# Ready for liltr", "", "Press `Enter` to open the standalone liltr app with this text."].join("\n");
  }

  if (!props.result) {
    return ["_Translating…_"].join("\n");
  }

  return markdownEscape(props.result.text);
}
