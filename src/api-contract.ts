import { z } from "zod";

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
const optionalNonEmptyTrimmedStringSchema = z.string().trim().min(1).optional();

const localhostHostSchema = z.union([
  z.literal("localhost"),
  z.literal("127.0.0.1"),
  z.literal("[::1]"),
]);

export const localModelBaseUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      localhostHostSchema.safeParse(url.hostname).success
    );
  } catch {
    return false;
  }
}, "baseUrl must target localhost, 127.0.0.1, or [::1]");

/** Returns whether a model base URL satisfies the local-only privacy boundary. */
export function isLocalhostModelBaseUrl(value: string): boolean {
  return localModelBaseUrlSchema.safeParse(value).success;
}

export const entryModeSchema = z.enum(["free", "guided"]);
export const analysisStatusSchema = z.enum(["idle", "running", "done", "error"]);

export const reflectionSchema = z.object({
  emotions: z.array(nonEmptyTrimmedStringSchema).min(1),
  themes: z.array(nonEmptyTrimmedStringSchema).min(1),
  // Required key in the model grammar, but nullable: the model returns null
  // when the section is not justified. Kept optional here so the parser also
  // tolerates producers that omit the key entirely.
  values: z.array(nonEmptyTrimmedStringSchema).min(1).nullable().optional(),
  cognitivePatterns: z.array(nonEmptyTrimmedStringSchema).min(1).nullable().optional(),
  reframes: z.array(nonEmptyTrimmedStringSchema).min(1).nullable().optional(),
});

export const analysisPatternSchema = z.object({
  pattern: nonEmptyTrimmedStringSchema,
  description: nonEmptyTrimmedStringSchema,
});

export const entryAnalysisSchema = z.object({
  summary: nonEmptyTrimmedStringSchema,
  reflections: reflectionSchema,
  patterns: z.array(analysisPatternSchema),
  followUpPrompts: z.array(nonEmptyTrimmedStringSchema).min(1),
});

export const journalEntrySchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  createdAt: isoDateTimeSchema,
  content: nonEmptyTrimmedStringSchema,
  mode: entryModeSchema,
  guidingPrompts: z.array(nonEmptyTrimmedStringSchema).min(1).optional(),
  seededPrompt: optionalNonEmptyTrimmedStringSchema,
  analysisStatus: analysisStatusSchema,
  analysisError: optionalNonEmptyTrimmedStringSchema,
  analysis: entryAnalysisSchema.optional(),
});

export const localModelSettingsSchema = z.object({
  baseUrl: localModelBaseUrlSchema,
  model: nonEmptyTrimmedStringSchema,
  apiKey: optionalNonEmptyTrimmedStringSchema,
});

export const promptListSchema = z.object({
  prompts: z.array(nonEmptyTrimmedStringSchema).min(3).max(5),
});

export const apiErrorCodeSchema = z.enum([
  "bad_request",
  "not_found",
  "validation_error",
  "conflict",
  "db_error",
  "model_unavailable",
  "model_invalid_response",
  "analysis_failed",
  "internal_error",
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: nonEmptyTrimmedStringSchema,
  details: z.unknown().optional(),
});

export const healthStatusSchema = z.enum(["ok", "degraded", "error"]);

export const getHealthResponseSchema = z.object({
  status: healthStatusSchema,
  server: z.object({
    status: healthStatusSchema,
    runtime: z.literal("bun"),
    version: nonEmptyTrimmedStringSchema,
    now: isoDateTimeSchema,
  }),
  database: z.object({
    status: healthStatusSchema,
    path: nonEmptyTrimmedStringSchema,
    journalMode: z.literal("wal"),
  }),
  modelConfig: z.object({
    configured: z.boolean(),
    baseUrl: nonEmptyTrimmedStringSchema.optional(),
    model: nonEmptyTrimmedStringSchema.optional(),
    isLocalhost: z.boolean().optional(),
  }),
});

export const getSettingsResponseSchema = z.object({
  settings: localModelSettingsSchema.nullable(),
});

export const putSettingsRequestSchema = localModelSettingsSchema;
export const putSettingsResponseSchema = z.object({
  settings: localModelSettingsSchema,
});

export const postSettingsTestRequestSchema = localModelSettingsSchema;
export const postSettingsTestResponseSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  provider: z.object({
    baseUrl: nonEmptyTrimmedStringSchema,
    model: nonEmptyTrimmedStringSchema,
  }),
  error: apiErrorSchema.optional(),
});

export const getEntriesResponseSchema = z.object({
  entries: z.array(journalEntrySchema),
});

export const postEntriesRequestSchema = z
  .object({
    content: nonEmptyTrimmedStringSchema,
    mode: entryModeSchema,
    guidingPrompts: z.array(nonEmptyTrimmedStringSchema).min(1).optional(),
    seededPrompt: optionalNonEmptyTrimmedStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === "free" && value.guidingPrompts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guidingPrompts"],
        message: "guidingPrompts are only allowed for guided mode",
      });
    }
  });

export const postEntriesResponseSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
});

export const getEntryByIdResponseSchema = z.object({
  entry: journalEntrySchema,
});

export const putEntryRequestSchema = z.object({
  content: nonEmptyTrimmedStringSchema,
});

export const putEntryResponseSchema = z.object({
  entry: journalEntrySchema,
});

export const postPromptsRequestSchema = z.object({
  recentEntries: z.array(nonEmptyTrimmedStringSchema).max(3).optional(),
});

export const postPromptsResponseSchema = promptListSchema;

export const postEntryAnalyzeRequestSchema = z.object({
  retry: z.boolean().optional(),
});

export const analysisSseEventTypeSchema = z.enum(["status", "progress", "complete", "error"]);

export const analysisSseStatusEventSchema = z.object({
  event: z.literal("status"),
  data: z.object({
    status: analysisStatusSchema,
    message: nonEmptyTrimmedStringSchema,
  }),
});

export const analysisSseProgressEventSchema = z.object({
  event: z.literal("progress"),
  data: z.object({
    stage: z.enum([
      "queued",
      "loading_entry",
      "loading_history",
      "requesting_model",
      "streaming",
      "validating",
      "persisting",
    ]),
    message: nonEmptyTrimmedStringSchema,
  }),
});

export const analysisSseCompleteEventSchema = z.object({
  event: z.literal("complete"),
  data: z.object({
    entryId: nonEmptyTrimmedStringSchema,
    analysisStatus: z.literal("done"),
    analysis: entryAnalysisSchema,
  }),
});

export const analysisSseErrorEventSchema = z.object({
  event: z.literal("error"),
  data: z.object({
    entryId: nonEmptyTrimmedStringSchema,
    analysisStatus: z.literal("error"),
    error: apiErrorSchema,
  }),
});

export const analysisSseEventSchema = z.discriminatedUnion("event", [
  analysisSseStatusEventSchema,
  analysisSseProgressEventSchema,
  analysisSseCompleteEventSchema,
  analysisSseErrorEventSchema,
]);

export type EntryMode = z.infer<typeof entryModeSchema>;
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type AnalysisPattern = z.infer<typeof analysisPatternSchema>;
export type EntryAnalysis = z.infer<typeof entryAnalysisSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type LocalModelSettings = z.infer<typeof localModelSettingsSchema>;
export type PromptList = z.infer<typeof promptListSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type GetHealthResponse = z.infer<typeof getHealthResponseSchema>;
export type GetSettingsResponse = z.infer<typeof getSettingsResponseSchema>;
export type PutSettingsRequest = z.infer<typeof putSettingsRequestSchema>;
export type PutSettingsResponse = z.infer<typeof putSettingsResponseSchema>;
export type PostSettingsTestRequest = z.infer<typeof postSettingsTestRequestSchema>;
export type PostSettingsTestResponse = z.infer<typeof postSettingsTestResponseSchema>;
export type GetEntriesResponse = z.infer<typeof getEntriesResponseSchema>;
export type PostEntriesRequest = z.infer<typeof postEntriesRequestSchema>;
export type PostEntriesResponse = z.infer<typeof postEntriesResponseSchema>;
export type GetEntryByIdResponse = z.infer<typeof getEntryByIdResponseSchema>;
export type PutEntryRequest = z.infer<typeof putEntryRequestSchema>;
export type PutEntryResponse = z.infer<typeof putEntryResponseSchema>;
export type PostPromptsRequest = z.infer<typeof postPromptsRequestSchema>;
export type PostPromptsResponse = z.infer<typeof postPromptsResponseSchema>;
export type PostEntryAnalyzeRequest = z.infer<typeof postEntryAnalyzeRequestSchema>;
export type AnalysisSseEventType = z.infer<typeof analysisSseEventTypeSchema>;
export type AnalysisSseStatusEvent = z.infer<typeof analysisSseStatusEventSchema>;
export type AnalysisSseProgressEvent = z.infer<typeof analysisSseProgressEventSchema>;
export type AnalysisSseCompleteEvent = z.infer<typeof analysisSseCompleteEventSchema>;
export type AnalysisSseErrorEvent = z.infer<typeof analysisSseErrorEventSchema>;
export type AnalysisSseEvent = z.infer<typeof analysisSseEventSchema>;
