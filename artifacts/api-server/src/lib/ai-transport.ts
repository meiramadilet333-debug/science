import { integerSetting, operationSignal } from "./operation-context";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_CONTEXT_WORKS = 12;

type OpenAIDiagnosticCode =
  | "invalid_json_schema"
  | "unsupported_value"
  | "model_not_found"
  | "insufficient_quota"
  | "billing_hard_limit_reached"
  | "rate_limit_exceeded"
  | "invalid_api_key"
  | "permission_denied"
  | "missing_permissions"
  | "server_error"
  | "context_length_exceeded";

type OpenAIDiagnosticType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "rate_limit_error"
  | "server_error";

type OpenAITransportError = "timeout" | "network" | "aborted";

export class IdeaAnalysisError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "provider_error" | "invalid_response" | "input_error" | "timeout",
    readonly statusCode?: number,
    readonly diagnosticCode?: OpenAIDiagnosticCode,
    readonly diagnosticType?: OpenAIDiagnosticType,
    readonly transportError?: OpenAITransportError,
    readonly validationPaths?: string[],
  ) {
    super(message);
    this.name = "IdeaAnalysisError";
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function getProviderDiagnostics(payload: unknown): {
  code?: OpenAIDiagnosticCode;
  type?: OpenAIDiagnosticType;
} {
  const error = asRecord(asRecord(payload)?.error);
  const codes: OpenAIDiagnosticCode[] = [
    "invalid_json_schema",
    "unsupported_value",
    "model_not_found",
    "insufficient_quota",
    "billing_hard_limit_reached",
    "rate_limit_exceeded",
    "invalid_api_key",
    "permission_denied",
    "missing_permissions",
    "server_error",
    "context_length_exceeded",
  ];
  const types: OpenAIDiagnosticType[] = [
    "invalid_request_error",
    "authentication_error",
    "permission_error",
    "rate_limit_error",
    "server_error",
  ];

  return {
    ...(typeof error?.code === "string" && codes.includes(error.code as OpenAIDiagnosticCode)
      ? { code: error.code as OpenAIDiagnosticCode }
      : {}),
    ...(typeof error?.type === "string" && types.includes(error.type as OpenAIDiagnosticType)
      ? { type: error.type as OpenAIDiagnosticType }
      : {}),
  };
}

function getOutputText(payload: unknown): string | null {
  const response = asRecord(payload);
  if (!Array.isArray(response?.output)) return null;

  for (const item of response.output) {
    const message = asRecord(item);
    if (message?.type !== "message" || !Array.isArray(message.content)) continue;

    for (const content of message.content) {
      const text = asRecord(content);
      if (text?.type === "output_text" && typeof text.text === "string") {
        return text.text;
      }
    }
  }

  return null;
}

function getSignalFailure(signal: AbortSignal): IdeaAnalysisError | null {
  if (!signal.aborted) return null;
  const timedOut = signal.reason instanceof Error && signal.reason.name === "TimeoutError";
  return new IdeaAnalysisError(
    timedOut ? "The AI request timed out." : "The AI request was aborted.",
    timedOut ? "timeout" : "provider_error",
    undefined,
    undefined,
    undefined,
    timedOut ? "timeout" : "aborted",
  );
}

export async function requestStructuredOutput(
  name: string,
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  useInstructionsField = false,
  language: "ru" | "kk" = "ru",
): Promise<UnknownRecord> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new IdeaAnalysisError(
      "The AI service is not configured.",
      "not_configured",
    );
  }

  const signal = operationSignal();
  signal.throwIfAborted();
  let response: Response;
  try {
    const responseLanguageInstruction = language === "kk"
      ? "Write all explanatory and generated natural-language fields in fluent, grammatically correct Kazakh. Keep publication titles, author names, DOI, URLs, direct quotations, and other source-provided proper data unchanged."
      : "Write all explanatory and generated natural-language fields in Russian. Keep publication titles, author names, DOI, URLs, direct quotations, and other source-provided proper data unchanged.";
    const localizedSystemPrompt = `${language === "kk" ? systemPrompt.replace(/На русском языке:?|На русском|Отвечай на русском|Все пояснения пиши на русском языке\./gi, "") : systemPrompt}\n\n${responseLanguageInstruction}`;
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: ["Bearer", apiKey].join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
        max_output_tokens: integerSetting("OPENAI_MAX_OUTPUT_TOKENS", 6000, 32000),
        ...(useInstructionsField
          ? { instructions: localizedSystemPrompt, input: userPrompt }
          : {
              input: [
                { role: "system", content: localizedSystemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
      }),
      signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError" ||
      signal.aborted && signal.reason instanceof Error && signal.reason.name === "TimeoutError";
    throw new IdeaAnalysisError(
      "The AI service could not be reached.",
      timedOut ? "timeout" : "provider_error",
      undefined,
      undefined,
      undefined,
      timedOut
        ? "timeout"
        : signal.aborted ? "aborted" : "network",
    );
  }

  if (!response.ok) {
    let providerPayload: unknown;
    try {
      providerPayload = await response.json();
    } catch {
      const signalFailure = getSignalFailure(signal);
      if (signalFailure) throw signalFailure;
      providerPayload = null;
    }
    const diagnostics = getProviderDiagnostics(providerPayload);
    throw new IdeaAnalysisError(
      "The AI service returned an unsuccessful response.",
      "provider_error",
      response.status,
      diagnostics.code,
      diagnostics.type,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const signalFailure = getSignalFailure(signal);
    if (signalFailure) throw signalFailure;
    throw new IdeaAnalysisError(
      "The AI service returned invalid JSON.",
      "invalid_response",
    );
  }
  signal.throwIfAborted();

  const outputText = getOutputText(payload);
  if (!outputText) {
    throw new IdeaAnalysisError(
      "The AI service returned no structured output.",
      "invalid_response",
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(outputText);
  } catch {
    throw new IdeaAnalysisError(
      "The AI service returned malformed structured output.",
      "invalid_response",
    );
  }

  const outputObject = asRecord(output);
  if (!outputObject) {
    throw new IdeaAnalysisError(
      "The AI service returned an invalid output shape.",
      "invalid_response",
    );
  }

  return outputObject;
}
