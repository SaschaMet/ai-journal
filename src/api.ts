import {
  type AnalysisSseEvent,
  analysisSseCompleteEventSchema,
  analysisSseErrorEventSchema,
  analysisSseProgressEventSchema,
  analysisSseStatusEventSchema,
  apiErrorSchema,
  getEntriesResponseSchema,
  getEntryByIdResponseSchema,
  getHealthResponseSchema,
  getSettingsResponseSchema,
  isLocalhostModelBaseUrl,
  postEntriesRequestSchema,
  postEntriesResponseSchema,
  postEntryAnalyzeRequestSchema,
  postPromptsRequestSchema,
  postPromptsResponseSchema,
  postSettingsTestRequestSchema,
  postSettingsTestResponseSchema,
  putEntryRequestSchema,
  putEntryResponseSchema,
  putSettingsRequestSchema,
  putSettingsResponseSchema,
  type ApiErrorCode,
  type JournalEntry,
} from "./api-contract";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  ModelRequestError,
  generateGuidingPrompts,
  resolveModelSettings,
  streamEntryAnalysis,
  testModelServer,
} from "./ai";
import { DATABASE_PATH, db } from "./db";
import {
  createEntry,
  deleteEntry,
  getEntryById,
  getSettings,
  listEntries,
  saveEntryAnalysis,
  updateEntryAnalysisStatus,
  updateEntryContent,
  upsertSettings,
} from "./repositories";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const SSE_HEADERS = {
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "content-type": "text/event-stream; charset=utf-8",
};

/** Routes local API requests and returns validated JSON or SSE responses. */
export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/health") {
    return handleGetHealth();
  }

  if (pathname === "/api/settings") {
    if (request.method === "GET") {
      return handleGetSettings();
    }

    if (request.method === "PUT") {
      return handlePutSettings(request);
    }
  }

  if (request.method === "POST" && pathname === "/api/settings/test") {
    return handlePostSettingsTest(request);
  }

  if (pathname === "/api/entries") {
    if (request.method === "GET") {
      return handleGetEntries();
    }

    if (request.method === "POST") {
      return handlePostEntries(request);
    }
  }

  const analyzeMatch = pathname.match(/^\/api\/entries\/([^/]+)\/analyze$/);
  const analyzeEntryId = analyzeMatch?.[1];
  if (request.method === "POST" && analyzeEntryId) {
    return handlePostAnalyze(request, analyzeEntryId);
  }

  const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/);
  const entryId = entryMatch?.[1];
  if (request.method === "GET" && entryId) {
    return handleGetEntryById(entryId);
  }

  if (request.method === "PUT" && entryId) {
    return handlePutEntry(request, entryId);
  }

  if (request.method === "DELETE" && entryId) {
    return handleDeleteEntry(entryId);
  }

  if (request.method === "POST" && pathname === "/api/prompts") {
    return handlePostPrompts(request);
  }

  return errorResponse(404, "not_found", `No route for ${request.method} ${pathname}`);
}

function handleGetHealth(): Response {
  const settings = getSettings(db);

  return jsonResponse(getHealthResponseSchema, {
    status: "ok",
    server: {
      status: "ok",
      runtime: "bun",
      version: Bun.version,
      now: new Date().toISOString(),
    },
    database: {
      status: "ok",
      path: DATABASE_PATH,
      journalMode: "wal",
    },
    modelConfig: {
      configured: Boolean(settings),
      baseUrl: settings?.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL,
      model: settings?.model,
      isLocalhost: isLocalhostModelBaseUrl(settings?.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL),
    },
  });
}

function handleGetSettings(): Response {
  return jsonResponse(getSettingsResponseSchema, {
    settings: getSettings(db),
  });
}

async function handlePutSettings(request: Request): Promise<Response> {
  const body = await readJson(request, putSettingsRequestSchema);
  if (body instanceof Response) {
    return body;
  }

  const settings = upsertSettings(db, body);
  return jsonResponse(putSettingsResponseSchema, { settings });
}

async function handlePostSettingsTest(request: Request): Promise<Response> {
  const body = await readJson(request, postSettingsTestRequestSchema);
  if (body instanceof Response) {
    return body;
  }

  const startedAt = performance.now();

  try {
    await testModelServer(body);

    return jsonResponse(postSettingsTestResponseSchema, {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      provider: {
        baseUrl: body.baseUrl,
        model: body.model,
      },
    });
  } catch (error) {
    const apiError = toApiError(error);
    return jsonResponse(
      postSettingsTestResponseSchema,
      {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        provider: {
          baseUrl: body.baseUrl,
          model: body.model,
        },
        error: {
          code: apiError.code,
          message: apiError.message,
        },
      },
      { status: apiError.status },
    );
  }
}

function handleGetEntries(): Response {
  return jsonResponse(getEntriesResponseSchema, {
    entries: listEntries(db),
  });
}

async function handlePostEntries(request: Request): Promise<Response> {
  const body = await readJson(request, postEntriesRequestSchema);
  if (body instanceof Response) {
    return body;
  }

  const entry = createEntry(db, body);
  return jsonResponse(postEntriesResponseSchema, { id: entry.id }, { status: 201 });
}

function handleGetEntryById(id: string): Response {
  const entry = getEntryById(db, id);
  if (!entry) {
    return errorResponse(404, "not_found", `Entry ${id} not found`);
  }

  return jsonResponse(getEntryByIdResponseSchema, { entry });
}

async function handlePutEntry(request: Request, id: string): Promise<Response> {
  const entry = getEntryById(db, id);
  if (!entry) {
    return errorResponse(404, "not_found", `Entry ${id} not found`);
  }

  const body = await readJson(request, putEntryRequestSchema);
  if (body instanceof Response) {
    return body;
  }

  const updated = updateEntryContent(db, id, body.content);
  if (!updated) {
    return errorResponse(404, "not_found", `Entry ${id} not found`);
  }

  return jsonResponse(putEntryResponseSchema, { entry: updated });
}

function handleDeleteEntry(id: string): Response {
  const entry = getEntryById(db, id);
  if (!entry) {
    return errorResponse(404, "not_found", `Entry ${id} not found`);
  }

  deleteEntry(db, id);
  return new Response(null, { status: 204 });
}

async function handlePostPrompts(request: Request): Promise<Response> {
  const body = await readJsonOrDefault(request, postPromptsRequestSchema, {});
  if (body instanceof Response) {
    return body;
  }

  try {
    const settings = await resolveModelSettings(getSettings(db));
    const recentEntries =
      body.recentEntries ??
      listEntries(db)
        .slice(0, 3)
        .map((entry) => entry.content);
    const prompts = await generateGuidingPrompts(settings, recentEntries);
    return jsonResponse(postPromptsResponseSchema, prompts);
  } catch (error) {
    const apiError = toApiError(error);
    return errorResponse(apiError.status, apiError.code, apiError.message);
  }
}

async function handlePostAnalyze(request: Request, id: string): Promise<Response> {
  const body = await readJsonOrDefault(request, postEntryAnalyzeRequestSchema, {});
  if (body instanceof Response) {
    return body;
  }

  const entry = getEntryById(db, id);
  if (!entry) {
    return errorResponse(404, "not_found", `Entry ${id} not found`);
  }

  if (entry.analysisStatus === "running") {
    return errorResponse(409, "conflict", "Analysis is already running");
  }

  if (entry.analysisStatus === "done" && !body.retry) {
    return errorResponse(409, "conflict", "Analysis already exists. Retry with retry=true.");
  }

  updateEntryAnalysisStatus(db, entry.id, "running");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void runAnalysisStream(controller, entry);
    },
    cancel() {
      updateEntryAnalysisStatus(db, entry.id, "error", "Analysis stream cancelled");
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function runAnalysisStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  entry: JournalEntry,
): Promise<void> {
  try {
    controller.enqueue(
      encodeSse(
        analysisSseStatusEventSchema.parse({
          event: "status",
          data: {
            status: "running",
            message: "Analysis request accepted",
          },
        }),
      ),
    );

    controller.enqueue(createProgressEvent("loading_history", "Loading recent journal history"));
    const settings = await resolveModelSettings(getSettings(db));
    const recentEntries = listEntries(db)
      .filter((recentEntry) => recentEntry.id !== entry.id)
      .slice(0, 10);

    controller.enqueue(
      createProgressEvent("requesting_model", `Requesting LM Studio model ${settings.model}`),
    );

    const analysis = await streamEntryAnalysis(settings, entry, recentEntries, (message) => {
      controller.enqueue(createProgressEvent("streaming", message));
    });

    controller.enqueue(createProgressEvent("validating", "Validating LM Studio structured output"));
    controller.enqueue(createProgressEvent("persisting", "Persisting validated analysis"));
    saveEntryAnalysis(db, entry.id, analysis);
    controller.enqueue(
      encodeSse(
        analysisSseCompleteEventSchema.parse({
          event: "complete",
          data: {
            entryId: entry.id,
            analysisStatus: "done",
            analysis,
          },
        }),
      ),
    );
  } catch (error) {
    const apiError = toApiError(error);
    updateEntryAnalysisStatus(db, entry.id, "error", apiError.message);
    controller.enqueue(
      encodeSse(
        analysisSseErrorEventSchema.parse({
          event: "error",
          data: {
            entryId: entry.id,
            analysisStatus: "error",
            error: {
              code: apiError.code,
              message: apiError.message,
            },
          },
        }),
      ),
    );
  } finally {
    controller.close();
  }
}

async function readJson<T>(
  request: Request,
  schema: {
    safeParse(
      input: unknown,
    ): { success: true; data: T } | { success: false; error: { flatten(): unknown } };
  },
): Promise<T | Response> {
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(400, "validation_error", "Invalid request body", parsed.error.flatten());
    }

    return parsed.data;
  } catch (error) {
    return errorResponse(
      400,
      "bad_request",
      error instanceof Error ? error.message : "Failed to parse request body",
    );
  }
}

async function readJsonOrDefault<T>(
  request: Request,
  schema: {
    safeParse(
      input: unknown,
    ): { success: true; data: T } | { success: false; error: { flatten(): unknown } };
  },
  fallback: T,
): Promise<T | Response> {
  if (request.body === null) {
    const parsed = schema.safeParse(fallback);
    if (!parsed.success) {
      return errorResponse(500, "internal_error", "Invalid default request payload");
    }

    return parsed.data;
  }

  return readJson(request, schema);
}

function jsonResponse<T>(
  schema: { parse(input: unknown): T },
  payload: unknown,
  init?: ResponseInit,
): Response {
  return Response.json(schema.parse(payload), {
    status: init?.status ?? 200,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    apiErrorSchema.parse({
      code,
      message,
      details,
    }),
    {
      status,
      headers: JSON_HEADERS,
    },
  );
}

function encodeSse(payload: AnalysisSseEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${payload.event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function createProgressEvent(
  stage:
    | "queued"
    | "loading_entry"
    | "loading_history"
    | "requesting_model"
    | "streaming"
    | "validating"
    | "persisting",
  message: string,
): Uint8Array {
  return encodeSse(
    analysisSseProgressEventSchema.parse({
      event: "progress",
      data: {
        stage,
        message,
      },
    }),
  );
}

function toApiError(error: unknown): { status: number; code: ApiErrorCode; message: string } {
  if (error instanceof ModelRequestError) {
    return {
      status: error.code === "model_unavailable" ? 503 : 502,
      code: error.code,
      message: error.message,
    };
  }

  return {
    status: 500,
    code: "internal_error",
    message: error instanceof Error ? error.message : "Internal server error",
  };
}
