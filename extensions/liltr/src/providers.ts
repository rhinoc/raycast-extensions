import crypto from "node:crypto";
import {
  detectLanguageFromText,
  fixTargetLanguage,
  getLanguageByCode,
  type Language,
  type LanguageCode,
  type SourceLanguageCode,
} from "./languages";
import type { Preferences } from "./preferences";

export type ProviderId = "niutrans" | "volcengine" | "baidu" | "ali" | "ollama";

export type ProviderDefinition = {
  id: ProviderId;
  title: string;
  requiresCredentials: boolean;
};

export type TranslationRequest = {
  text: string;
  sourceLanguageCode: SourceLanguageCode;
  targetLanguageCode: LanguageCode;
  providerId: ProviderId;
  preferences: Preferences;
};

export type TranslationResult = {
  text: string;
  provider: ProviderDefinition;
  sourceLanguage: Language;
  targetLanguage: Language;
};

const providerDefinitions: ProviderDefinition[] = [
  { id: "niutrans", title: "NiuTrans", requiresCredentials: true },
  { id: "volcengine", title: "Volcengine", requiresCredentials: true },
  { id: "baidu", title: "Baidu", requiresCredentials: true },
  { id: "ali", title: "Ali", requiresCredentials: true },
  { id: "ollama", title: "Ollama", requiresCredentials: false },
];

const providerMap = new Map(providerDefinitions.map((provider) => [provider.id, provider]));
const translationCache = new Map<string, TranslationResult>();

export function getProviders() {
  return providerDefinitions;
}

export function getProviderById(providerId: ProviderId) {
  return providerMap.get(providerId) ?? providerDefinitions[0];
}

export async function translateText(request: TranslationRequest): Promise<TranslationResult> {
  const sourceText = request.text.trim();
  if (!sourceText) {
    throw new Error("Please enter text to translate.");
  }

  const sourceLanguage =
    request.sourceLanguageCode === "auto"
      ? detectLanguageFromText(sourceText, request.preferences.primaryLanguage, request.preferences.secondaryLanguage)
      : getLanguageByCode(request.sourceLanguageCode);

  const preferredTargetLanguage = getLanguageByCode(request.targetLanguageCode);
  const targetLanguage = fixTargetLanguage(
    sourceLanguage,
    preferredTargetLanguage,
    request.preferences.primaryLanguage,
    request.preferences.secondaryLanguage,
  );

  const provider = getProviderById(request.providerId);
  const cacheKey = [provider.id, sourceLanguage.code, targetLanguage.code, sourceText].join("__");
  const cached = translationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const translatedText = await performTranslation({
    providerId: provider.id,
    sourceText,
    sourceLanguage,
    targetLanguage,
    preferences: request.preferences,
  });

  const result = {
    text: translatedText.trim(),
    provider,
    sourceLanguage,
    targetLanguage,
  } satisfies TranslationResult;

  translationCache.set(cacheKey, result);
  return result;
}

type PerformTranslationRequest = {
  providerId: ProviderId;
  sourceText: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  preferences: Preferences;
};

async function performTranslation(request: PerformTranslationRequest) {
  switch (request.providerId) {
    case "niutrans":
      return translateWithNiuTrans(request);
    case "volcengine":
      return translateWithVolcengine(request);
    case "baidu":
      return translateWithBaidu(request);
    case "ali":
      return translateWithAli(request);
    case "ollama":
      return translateWithOllama(request);
    default:
      throw new Error(`Unsupported provider: ${request.providerId}`);
  }
}

function requirePreference(value: string | undefined, label: string) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error(`Missing ${label}. Open Extension Preferences to configure it.`);
  }

  return normalizedValue;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Request failed with status ${response.status}.`);
  }

  if (!text) {
    throw new Error("The translation service returned an empty response.");
  }

  return JSON.parse(text) as T;
}

async function translateWithNiuTrans(request: PerformTranslationRequest) {
  const apiKey = requirePreference(request.preferences.niutransApiKey, "NiuTrans API Key");

  const response = await fetch("https://api.niutrans.com/NiuTransServer/translation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      src_text: request.sourceText,
      from: request.sourceLanguage.shortCode,
      to: request.targetLanguage.shortCode,
    }),
  });

  const data = await parseResponse<{ error_code?: string; error_msg?: string; tgt_text?: string }>(response);
  if (data.error_msg) {
    throw new Error(`${data.error_code ?? "NiuTrans"}: ${data.error_msg}`);
  }

  if (!data.tgt_text) {
    throw new Error("NiuTrans returned an empty translation.");
  }

  return data.tgt_text;
}

async function translateWithBaidu(request: PerformTranslationRequest) {
  const appId = requirePreference(request.preferences.baiduAppId, "Baidu App ID");
  const secretKey = requirePreference(request.preferences.baiduSecretKey, "Baidu Secret Key");
  const salt = String(Math.round(Date.now() / 1000));
  const sign = crypto.createHash("md5").update(`${appId}${request.sourceText}${salt}${secretKey}`).digest("hex");

  const params = new URLSearchParams({
    q: request.sourceText,
    from: request.sourceLanguage.shortCode,
    to: request.targetLanguage.shortCode,
    appid: appId,
    salt,
    sign,
  });

  const response = await fetch("https://fanyi-api.baidu.com/api/trans/vip/translate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await parseResponse<{
    error_code?: string;
    error_msg?: string;
    trans_result?: Array<{ dst?: string }>;
  }>(response);

  if (data.error_msg) {
    throw new Error(`${data.error_code ?? "Baidu"}: ${data.error_msg}`);
  }

  const result = data.trans_result
    ?.map((item) => item.dst)
    .filter(Boolean)
    .join("\n");
  if (!result) {
    throw new Error("Baidu returned an empty translation.");
  }

  return result;
}

async function translateWithAli(request: PerformTranslationRequest) {
  const accessKeyId = requirePreference(request.preferences.aliAccessKeyId, "Ali Access Key ID");
  const accessKeySecret = requirePreference(request.preferences.aliAccessKeySecret, "Ali Access Key Secret");
  const date = new Date().toUTCString();
  const signatureNonce = crypto.randomUUID();
  const url = new URL("https://mt.cn-hangzhou.aliyuncs.com/api/translate/web/general");

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json;chrset=utf-8",
    Date: date,
    Host: url.host,
    "x-acs-signature-method": "HMAC-SHA1",
    "x-acs-signature-nonce": signatureNonce,
  };

  const stringToSign = [
    "POST",
    `${headers.Accept}\n`,
    headers["Content-Type"],
    headers.Date,
    "x-acs-signature-method:HMAC-SHA1",
    `x-acs-signature-nonce:${signatureNonce}`,
    url.pathname,
  ].join("\n");

  const signature = crypto.createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      Authorization: `acs ${accessKeyId}:${signature}`,
    },
    body: JSON.stringify({
      FormatType: "text",
      SourceText: request.sourceText,
      SourceLanguage: request.sourceLanguage.shortCode,
      TargetLanguage: request.targetLanguage.shortCode,
      Scene: "general",
    }),
  });

  const data = await parseResponse<{
    Code?: string;
    Message?: string;
    Data?: { Translated?: string };
  }>(response);

  if (data.Message) {
    throw new Error(`${data.Code ?? "Ali"}: ${data.Message}`);
  }

  if (!data.Data?.Translated) {
    throw new Error("Ali returned an empty translation.");
  }

  return data.Data.Translated;
}

async function translateWithVolcengine(request: PerformTranslationRequest) {
  const accessKeyId = requirePreference(request.preferences.volcengineAccessKeyId, "Volcengine Access Key ID");
  const secretAccessKey = requirePreference(
    request.preferences.volcengineSecretAccessKey,
    "Volcengine Secret Access Key",
  );

  const host = "translate.volcengineapi.com";
  const uri = "/";
  const queryString = "Action=TranslateText&Version=2020-06-01";
  const region = "cn-north-1";
  const service = "translate";

  const bodyObject = {
    SourceLanguage: request.sourceLanguage.shortCode,
    TargetLanguage: request.targetLanguage.shortCode,
    TextList: request.sourceText.split("\n"),
  };
  const body = JSON.stringify(bodyObject);
  const contentSha256 = crypto.createHash("sha256").update(body).digest("hex");
  const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);

  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${host}`,
    `x-content-sha256:${contentSha256}`,
    `x-date:${xDate}`,
  ].join("\n");
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = ["POST", uri, queryString, `${canonicalHeaders}\n`, signedHeaders, contentSha256].join("\n");
  const canonicalRequestHash = crypto.createHash("sha256").update(canonicalRequest).digest("hex");
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, canonicalRequestHash].join("\n");

  const kDate = hmac(secretAccessKey, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${uri}?${queryString}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Host: host,
      "X-Content-Sha256": contentSha256,
      "X-Date": xDate,
    },
    body,
  });

  const data = await parseResponse<{
    ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
    TranslationList?: Array<{ Translation?: string }>;
  }>(response);

  if (data.ResponseMetadata?.Error?.Message) {
    throw new Error(`${data.ResponseMetadata.Error.Code ?? "Volcengine"}: ${data.ResponseMetadata.Error.Message}`);
  }

  const result = data.TranslationList?.map((item) => item.Translation)
    .filter(Boolean)
    .join("\n");
  if (!result) {
    throw new Error("Volcengine returned an empty translation.");
  }

  return result;
}

async function translateWithOllama(request: PerformTranslationRequest) {
  const response = await fetch(request.preferences.ollamaApiUrl ?? "http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.preferences.ollamaModel ?? "qwen2",
      stream: false,
      messages: [
        {
          role: "user",
          content: `Assuming you are a seasoned translator, please translate the following source text to ${request.targetLanguage.name} as target language, ensuring accuracy while trying to retain emotion and natural flow. Your response should ONLY contain the translated result.\nThe source text is: \`\`\`${request.sourceText}\`\`\``,
        },
      ],
    }),
  });

  const data = await parseResponse<{ message?: { content?: string } }>(response);
  if (!data.message?.content) {
    throw new Error("Ollama returned an empty translation.");
  }

  return data.message.content;
}

function hmac(key: string | Buffer, value: string) {
  return crypto.createHmac("sha256", key).update(value).digest();
}
