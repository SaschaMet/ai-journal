import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  generateGuidingPrompts,
  resolveModelSettings,
  streamEntryAnalysis,
} from "./ai";
import type { JournalEntry, LocalModelSettings } from "./api-contract";

type MockFetchImplementation = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

type CapturedRequest = {
  url: string;
  init: Parameters<typeof fetch>[1] | undefined;
};

const originalFetch = globalThis.fetch;
const capturedRequests: CapturedRequest[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  capturedRequests.length = 0;
});

describe("LM Studio integration", () => {
  test("discovers the first loaded LM Studio model on the default port", async () => {
    mockFetch(async (input) => {
      capturedRequests.push({
        url: String(input),
        init: undefined,
      });

      return Response.json({
        data: [{ id: "lmstudio-community/qwen2.5-7b-instruct" }],
      });
    });

    await expect(resolveModelSettings(null)).resolves.toEqual({
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      model: "lmstudio-community/qwen2.5-7b-instruct",
    } satisfies LocalModelSettings);

    expect(capturedRequests[0]?.url).toBe(
      `${new URL(DEFAULT_LM_STUDIO_BASE_URL).origin}/v1/models`,
    );
  });

  test("requests structured prompt output from LM Studio", async () => {
    mockFetch(async (input, init) => {
      capturedRequests.push({
        url: String(input),
        init,
      });

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompts: [
                  "What moment from today still feels unresolved?",
                  "What need or value was underneath that moment?",
                  "What would a kind next step look like tomorrow?",
                ],
              }),
            },
          },
        ],
      });
    });

    const settings: LocalModelSettings = {
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      model: "lmstudio-community/qwen2.5-7b-instruct",
    };

    await expect(generateGuidingPrompts(settings, ["Yesterday felt heavy."])).resolves.toEqual({
      prompts: [
        "What moment from today still feels unresolved?",
        "What need or value was underneath that moment?",
        "What would a kind next step look like tomorrow?",
      ],
    });

    expect(capturedRequests[0]?.url).toBe(
      `${new URL(DEFAULT_LM_STUDIO_BASE_URL).origin}/v1/chat/completions`,
    );
    const requestBody = parseRequestBody(capturedRequests[0]);
    expect(requestBody.response_format.type).toBe("json_schema");
    expect(requestBody.response_format.json_schema.name).toBe("guiding_prompts");
    expect(requestBody.stream).toBe(false);
  });

  test("falls back to reasoning_content when content is empty (reasoning models)", async () => {
    mockFetch(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: "",
              reasoning_content: JSON.stringify({
                prompts: [
                  "What lingered in the background today?",
                  "What did your body seem to be telling you?",
                  "What moment stood out, without judging it?",
                ],
              }),
            },
          },
        ],
      }),
    );

    const settings: LocalModelSettings = {
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      model: "qwen3.6-27b-mtp@q4_k_s",
    };

    await expect(generateGuidingPrompts(settings, [])).resolves.toEqual({
      prompts: [
        "What lingered in the background today?",
        "What did your body seem to be telling you?",
        "What moment stood out, without judging it?",
      ],
    });
  });

  test("streams analysis from reasoning_content deltas when content is empty", async () => {
    const analysisJson =
      '{"summary":"A grounded day","reflections":{"emotions":["calm"],"themes":["routine"]},"patterns":[],"followUpPrompts":["What felt repeatable?"]}';

    mockFetch(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              for (const ch of analysisJson) {
                controller.enqueue(
                  enc.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: ch } }] })}\n\n`,
                  ),
                );
              }
              controller.enqueue(enc.encode("data: [DONE]\n\n"));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );

    const entry: JournalEntry = {
      id: "entry-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      content: "Today felt calm and repeatable.",
      mode: "free",
      analysisStatus: "idle",
    };

    const settings: LocalModelSettings = {
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      model: "qwen3.6-27b-mtp@q4_k_s",
    };

    await expect(streamEntryAnalysis(settings, entry, [])).resolves.toEqual({
      summary: "A grounded day",
      reflections: { emotions: ["calm"], themes: ["routine"] },
      patterns: [],
      followUpPrompts: ["What felt repeatable?"],
    });
  });

  test("streams structured analysis output from LM Studio", async () => {
    mockFetch(async (input, init) => {
      capturedRequests.push({
        url: String(input),
        init,
      });

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"{\\"summary\\":\\"A grounded day\\",\\"reflections\\":{\\"emotions\\":[\\"calm\\"],\\"themes\\":[\\"routine\\"]},\\"patterns\\":[{\\"pattern\\":\\"consistency\\",\\"description\\":\\"The entry highlights steady routines.\\"}],\\"followUpPrompts\\":[\\"What part of today felt most repeatable?\\"]}"}}]}\n\n',
              ),
            );
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
          },
        },
      );
    });

    const entry: JournalEntry = {
      id: "entry-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      content: "Today felt calm and repeatable.",
      mode: "free",
      analysisStatus: "idle",
    };

    const settings: LocalModelSettings = {
      baseUrl: DEFAULT_LM_STUDIO_BASE_URL,
      model: "lmstudio-community/qwen2.5-7b-instruct",
    };

    await expect(streamEntryAnalysis(settings, entry, [])).resolves.toEqual({
      summary: "A grounded day",
      reflections: {
        emotions: ["calm"],
        themes: ["routine"],
      },
      patterns: [
        {
          pattern: "consistency",
          description: "The entry highlights steady routines.",
        },
      ],
      followUpPrompts: ["What part of today felt most repeatable?"],
    });

    const requestBody = parseRequestBody(capturedRequests[0]);
    expect(requestBody.response_format.type).toBe("json_schema");
    expect(requestBody.response_format.json_schema.name).toBe("entry_analysis");
    expect(requestBody.stream).toBe(true);
  });
});

const requestBodySchema = z.object({
  response_format: z.object({
    type: z.string(),
    json_schema: z.object({
      name: z.string(),
    }),
  }),
  stream: z.boolean(),
});

function mockFetch(implementation: MockFetchImplementation): void {
  const fetchWithPreconnect = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      implementation(input, init),
    {
      preconnect: globalThis.fetch.preconnect.bind(globalThis.fetch),
    },
  );

  globalThis.fetch = fetchWithPreconnect;
}

function parseRequestBody(request: CapturedRequest | undefined): z.infer<typeof requestBodySchema> {
  const body = request?.init?.body;
  expect(typeof body).toBe("string");
  return requestBodySchema.parse(JSON.parse(String(body)));
}
