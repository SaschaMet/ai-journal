import { z } from "zod";
import {
  entryAnalysisSchema,
  type EntryAnalysis,
  type JournalEntry,
  type LocalModelSettings,
  postPromptsResponseSchema,
  type PromptList,
} from "./api-contract";
import { ENTRY_ANALYSIS_SYSTEM_PROMPT, GUIDING_PROMPTS_SYSTEM_PROMPT } from "./prompts";

export const DEFAULT_LM_STUDIO_BASE_URL = "http://127.0.0.1:1234/v1";

const REQUEST_TIMEOUT_MS = 30_000;
const MODELS_PATH = "/v1/models";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StructuredJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

/** Represents local model connectivity and response-contract failures. */
export class ModelRequestError extends Error {
  readonly code: "model_unavailable" | "model_invalid_response";

  constructor(code: "model_unavailable" | "model_invalid_response", message: string) {
    super(message);
    this.name = "ModelRequestError";
    this.code = code;
  }
}

const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().trim().min(1),
    }),
  ),
});

const chatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z
            .union([
              z.string(),
              z.array(
                z.object({
                  type: z.string(),
                  text: z.string().optional(),
                }),
              ),
            ])
            .nullable()
            .optional(),
          // Reasoning models (e.g. Qwen3) may place the structured JSON here
          // and leave `content` empty. Capture it as a fallback.
          reasoning_content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

const chatCompletionChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: z
        .object({
          content: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
        })
        .optional(),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
});

const promptsStructuredSchema = {
  name: "guiding_prompts",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      prompts: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "string",
        },
      },
    },
    required: ["prompts"],
  },
} satisfies StructuredJsonSchema;

const analysisStructuredSchema = {
  name: "entry_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
      },
      reflections: {
        type: "object",
        additionalProperties: false,
        properties: {
          emotions: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          themes: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          // Optional reflections: required keys, but nullable so the model
          // returns null when a section is not justified (OpenAI strict-mode
          // idiom) instead of being forced to fabricate content.
          values: {
            type: ["array", "null"],
            minItems: 1,
            items: { type: "string" },
          },
          cognitivePatterns: {
            type: ["array", "null"],
            minItems: 1,
            items: { type: "string" },
          },
          reframes: {
            type: ["array", "null"],
            minItems: 1,
            items: { type: "string" },
          },
        },
        required: ["emotions", "themes", "values", "cognitivePatterns", "reframes"],
      },
      patterns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            pattern: { type: "string" },
            description: { type: "string" },
          },
          required: ["pattern", "description"],
        },
      },
      followUpPrompts: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
      },
    },
    required: ["summary", "reflections", "patterns", "followUpPrompts"],
  },
} satisfies StructuredJsonSchema;

/** Resolves saved settings or discovers the default LM Studio model. */
export async function resolveModelSettings(
  settings: LocalModelSettings | null,
): Promise<LocalModelSettings> {
  if (settings) {
    return settings;
  }

  const model = await discoverDefaultModel(DEFAULT_LM_STUDIO_BASE_URL);
  return {
    baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
    model,
  };
}

/** Verifies that the configured local model server exposes the selected model. */
export async function testModelServer(settings: LocalModelSettings): Promise<void> {
  const response = await fetchModelEndpoint(
    settings.baseUrl,
    MODELS_PATH,
    withOptionalHeaders(
      {
        method: "GET",
      },
      createAuthHeaders(settings),
    ),
  );

  const payload = modelsResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ModelRequestError(
      "model_invalid_response",
      "Model server returned an invalid model list",
    );
  }

  if (!payload.data.data.some((model) => model.id === settings.model)) {
    throw new ModelRequestError(
      "model_unavailable",
      `Model "${settings.model}" is not available in LM Studio`,
    );
  }
}

/** Generates validated guiding prompts from recent journal context. */
export async function generateGuidingPrompts(
  settings: LocalModelSettings,
  recentEntries: string[],
): Promise<PromptList> {
  const content = await createStructuredCompletion(
    settings,
    [
      {
        role: "system",
        content: GUIDING_PROMPTS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({ recentEntries }),
      },
    ],
    promptsStructuredSchema,
  );

  return postPromptsResponseSchema.parse(parseStructuredContent(content));
}

/** Streams and validates structured analysis for a journal entry. */
export async function streamEntryAnalysis(
  settings: LocalModelSettings,
  entry: JournalEntry,
  recentEntries: JournalEntry[],
  onProgress?: (message: string) => void,
): Promise<EntryAnalysis> {
  onProgress?.("Requesting LM Studio analysis");

  const response = await fetchModelEndpoint(settings.baseUrl, CHAT_COMPLETIONS_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(settings),
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "system",
          content: ENTRY_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            currentEntry: {
              id: entry.id,
              createdAt: entry.createdAt,
              mode: entry.mode,
              content: entry.content,
              guidingPrompts: entry.guidingPrompts,
              seededPrompt: entry.seededPrompt,
            },
            recentEntries: recentEntries.map((recentEntry) => ({
              id: recentEntry.id,
              createdAt: recentEntry.createdAt,
              mode: recentEntry.mode,
              content: recentEntry.content,
              analysis: recentEntry.analysis,
            })),
          }),
        },
      ] satisfies ChatMessage[],
      response_format: createResponseFormat(analysisStructuredSchema),
      temperature: 0.2,
      stream: true,
    }),
  });

  const content = await readStructuredStreamingContent(response, onProgress);
  return entryAnalysisSchema.parse(parseStructuredContent(content));
}

async function discoverDefaultModel(baseUrl: string): Promise<string> {
  const response = await fetchModelEndpoint(baseUrl, MODELS_PATH, {
    method: "GET",
  });
  const payload = modelsResponseSchema.safeParse(await response.json());

  if (!payload.success) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio returned an invalid model list",
    );
  }

  const modelId = payload.data.data[0]?.id;
  if (!modelId) {
    throw new ModelRequestError(
      "model_unavailable",
      "No LM Studio model is loaded on the default port",
    );
  }

  return modelId;
}

async function createStructuredCompletion(
  settings: LocalModelSettings,
  messages: ChatMessage[],
  structuredSchema: StructuredJsonSchema,
): Promise<string> {
  const response = await fetchModelEndpoint(settings.baseUrl, CHAT_COMPLETIONS_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...createAuthHeaders(settings),
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      response_format: createResponseFormat(structuredSchema),
      temperature: 0.2,
      stream: false,
    }),
  });

  const payload = chatCompletionResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio returned an invalid chat completion response",
    );
  }

  const choice = payload.data.choices[0];
  if (!choice) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio returned no completion choices",
    );
  }

  const text = extractTextContent(choice.message.content);
  // Reasoning models may emit the structured JSON in `reasoning_content`
  // while leaving `content` empty.
  const resolved = text.trim() ? text : (choice.message.reasoning_content ?? "");
  if (!resolved.trim()) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio did not return any content for structured output",
    );
  }

  return resolved;
}

async function readStructuredStreamingContent(
  response: Response,
  onProgress?: (message: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio did not return a readable stream",
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";

  const consume = (eventBlock: string): void => {
    const delta = parseContentDelta(eventBlock);
    if (delta.content || delta.reasoning) {
      content += delta.content;
      reasoning += delta.reasoning;
      onProgress?.("Streaming structured analysis from LM Studio");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replaceAll("\r\n", "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      consume(buffer.slice(0, boundaryIndex));
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    consume(buffer);
  }

  // Reasoning models may stream the structured JSON via `reasoning_content`
  // while leaving `content` empty. Prefer content, fall back to reasoning.
  const resolved = content.trim() ? content : reasoning;
  if (!resolved.trim()) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio stream did not include JSON content",
    );
  }

  return resolved;
}

function parseContentDelta(eventBlock: string): { content: string; reasoning: string } {
  const data = eventBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data || data === "[DONE]") {
    return { content: "", reasoning: "" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(data);
  } catch {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio stream returned invalid JSON chunks",
    );
  }

  const payload = chatCompletionChunkSchema.safeParse(parsedJson);
  if (!payload.success) {
    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio stream chunk shape was invalid",
    );
  }

  return {
    content: payload.data.choices.map((choice) => choice.delta?.content ?? "").join(""),
    reasoning: payload.data.choices.map((choice) => choice.delta?.reasoning_content ?? "").join(""),
  };
}

function parseStructuredContent(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Reasoning models may wrap the JSON in surrounding prose. Fall back to the
    // outermost { ... } span before giving up.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to the error below
      }
    }

    throw new ModelRequestError(
      "model_invalid_response",
      "LM Studio structured output was not valid JSON",
    );
  }
}

function extractTextContent(
  content: string | Array<{ type: string; text?: string | undefined }> | null | undefined,
): string {
  if (content == null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

async function fetchModelEndpoint(
  baseUrl: string,
  pathname: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(new URL(pathname, withTrailingSlash(baseUrl)), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ModelRequestError(
      "model_unavailable",
      error instanceof Error ? error.message : "LM Studio request failed",
    );
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new ModelRequestError(
      "model_unavailable",
      `LM Studio request failed with status ${response.status}${responseText ? `: ${responseText}` : ""}`,
    );
  }

  return response;
}

function createAuthHeaders(settings: LocalModelSettings): HeadersInit | undefined {
  if (!settings.apiKey) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${settings.apiKey}`,
  };
}

function withOptionalHeaders(init: RequestInit, headers: HeadersInit | undefined): RequestInit {
  if (!headers) {
    return init;
  }

  return {
    ...init,
    headers,
  };
}

function createResponseFormat(structuredSchema: StructuredJsonSchema): Record<string, unknown> {
  return {
    type: "json_schema",
    json_schema: {
      name: structuredSchema.name,
      strict: true,
      schema: structuredSchema.schema,
    },
  };
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
