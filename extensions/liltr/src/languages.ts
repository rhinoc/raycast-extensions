export type LanguageCode =
  | "en-US"
  | "zh-CN"
  | "ja-JP"
  | "ko-KR"
  | "fr-FR"
  | "es-ES"
  | "pt-PT"
  | "it-IT"
  | "de-DE"
  | "tr-TR"
  | "th-TH"
  | "ar-AE"
  | "id-ID"
  | "ms-MY"
  | "vi-VN";

export const AUTO_LANGUAGE_CODE = "auto" as const;
export type SourceLanguageCode = LanguageCode | typeof AUTO_LANGUAGE_CODE;

export type Language = {
  code: LanguageCode;
  flag: string;
  name: string;
  shortCode: string;
};

const baseLanguages: Omit<Language, "shortCode">[] = [
  { code: "en-US", flag: "🇺🇸", name: "English" },
  { code: "zh-CN", flag: "🇨🇳", name: "简体中文" },
  { code: "ja-JP", flag: "🇯🇵", name: "日本語" },
  { code: "ko-KR", flag: "🇰🇷", name: "한국어" },
  { code: "fr-FR", flag: "🇫🇷", name: "Français" },
  { code: "es-ES", flag: "🇪🇸", name: "Español" },
  { code: "pt-PT", flag: "🇵🇹", name: "Português" },
  { code: "it-IT", flag: "🇮🇹", name: "Italiano" },
  { code: "de-DE", flag: "🇩🇪", name: "Deutsch" },
  { code: "tr-TR", flag: "🇹🇷", name: "Türkçe" },
  { code: "th-TH", flag: "🇹🇭", name: "ไทย" },
  { code: "ar-AE", flag: "🇸🇦", name: "العربية" },
  { code: "id-ID", flag: "🇮🇩", name: "Bahasa Indonesia" },
  { code: "ms-MY", flag: "🇲🇾", name: "Bahasa Melayu" },
  { code: "vi-VN", flag: "🇻🇳", name: "Tiếng Việt" },
];

export const languages: Language[] = baseLanguages.map((language) => ({
  ...language,
  shortCode: language.code.split(/[-_]/)[0],
}));

const languageMap = new Map(languages.map((language) => [language.code, language]));

export function getLanguageByCode(code: string): Language {
  const exactMatch = languageMap.get(code as LanguageCode);
  if (exactMatch) {
    return exactMatch;
  }

  const shortCode = code.split(/[-_]/)[0];
  const shortMatch = languages.find((language) => language.shortCode === shortCode);
  return shortMatch ?? languages[0];
}

export function getSourceLanguageLabel(code: SourceLanguageCode) {
  if (code === AUTO_LANGUAGE_CODE) {
    return "Auto Detect";
  }

  const language = getLanguageByCode(code);
  return `${language.flag} ${language.name}`;
}

export function getLanguageLabel(code: LanguageCode) {
  const language = getLanguageByCode(code);
  return `${language.flag} ${language.name}`;
}

const uniqueScriptPatterns: Partial<Record<LanguageCode, RegExp>> = {
  "zh-CN": /[\u4e00-\u9fff]/,
  "ja-JP": /[\u3040-\u30ff]/,
  "ko-KR": /[\uac00-\ud7af]/,
  "th-TH": /[\u0e00-\u0e7f]/,
  "ar-AE": /[\u0600-\u06ff]/,
  "vi-VN": /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i,
};

const languageHints: Partial<Record<LanguageCode, string[]>> = {
  "en-US": ["the", "and", "are", "for", "with", "that", "this", "you", "from", "have"],
  "fr-FR": ["le", "la", "les", "des", "une", "est", "pas", "que", "pour", "avec"],
  "es-ES": ["el", "la", "los", "las", "una", "que", "para", "con", "está", "como"],
  "pt-PT": ["que", "para", "com", "uma", "não", "está", "como", "mais", "por", "isso"],
  "it-IT": ["che", "per", "con", "una", "non", "come", "sono", "della", "questo", "degli"],
  "de-DE": ["der", "die", "das", "und", "ist", "nicht", "ein", "ich", "mit", "für"],
  "tr-TR": ["ve", "bir", "bu", "çok", "için", "ile", "ama", "gibi", "şey", "olan"],
  "id-ID": ["yang", "dan", "untuk", "dengan", "tidak", "ini", "ada", "saya", "akan", "dari"],
  "ms-MY": ["yang", "dan", "untuk", "dengan", "tidak", "ini", "ada", "saya", "akan", "ialah"],
  "vi-VN": ["và", "của", "cho", "không", "một", "trong", "được", "những", "người", "này"],
};

function getLanguageScore(text: string, code: LanguageCode) {
  let score = 0;
  const scriptPattern = uniqueScriptPatterns[code];
  if (scriptPattern?.test(text)) {
    score += 10;
  }

  const normalized = text.toLocaleLowerCase();
  const tokens: string[] = normalized.match(/\p{L}+/gu) ?? [];
  const hints: string[] = languageHints[code] ?? [];

  for (const hint of hints) {
    if (tokens.includes(hint)) {
      score += 2;
    }
  }

  return score;
}

export function detectLanguageFromText(
  text: string,
  primaryLanguageCode: LanguageCode,
  secondaryLanguageCode: LanguageCode,
): Language {
  const value = text.trim();
  if (!value) {
    return getLanguageByCode(secondaryLanguageCode);
  }

  const primaryLanguage = getLanguageByCode(primaryLanguageCode);
  const secondaryLanguage = getLanguageByCode(secondaryLanguageCode);
  const candidates = [primaryLanguage, secondaryLanguage].filter(
    (language, index, languages) => languages.findIndex((item) => item.code === language.code) === index,
  );

  const scoredCandidates = candidates
    .map((language) => ({
      language,
      score: getLanguageScore(value, language.code),
    }))
    .sort((left, right) => right.score - left.score);

  if (scoredCandidates[0]?.score && scoredCandidates[0].score > scoredCandidates[1]?.score) {
    return scoredCandidates[0].language;
  }

  if (/^[\x20-\x7E\s]+$/u.test(value)) {
    if (candidates.some((language) => language.code === "en-US")) {
      return getLanguageByCode("en-US");
    }
  }

  const firstScriptMatch = (Object.entries(uniqueScriptPatterns) as Array<[LanguageCode, RegExp]>).find(([, pattern]) =>
    pattern.test(value),
  );
  if (firstScriptMatch) {
    return getLanguageByCode(firstScriptMatch[0]);
  }

  return secondaryLanguage;
}

export function fixTargetLanguage(
  sourceLanguage: Language,
  targetLanguage: Language,
  primaryLanguageCode: LanguageCode,
  secondaryLanguageCode: LanguageCode,
) {
  if (sourceLanguage.code !== targetLanguage.code) {
    return targetLanguage;
  }

  if (targetLanguage.code !== primaryLanguageCode) {
    return getLanguageByCode(primaryLanguageCode);
  }

  return getLanguageByCode(secondaryLanguageCode);
}
