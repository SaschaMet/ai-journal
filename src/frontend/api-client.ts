import type {
  AnalysisSseEvent,
  EntryAnalysis,
  GetEntriesResponse,
  GetEntryByIdResponse,
  GetSettingsResponse,
  JournalEntry,
  PostEntriesRequest,
  PostSettingsTestResponse,
  PutSettingsRequest,
  PutSettingsResponse,
} from "../api-contract";

const API = "/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error((err as { message?: string }).message ?? res.statusText), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}

/** Loads the journal entry list from the local API. */
export async function getEntries(): Promise<GetEntriesResponse> {
  return fetchJson<GetEntriesResponse>(`${API}/entries`);
}

/** Loads one journal entry by ID from the local API. */
export async function getEntryById(id: string): Promise<GetEntryByIdResponse> {
  return fetchJson<GetEntryByIdResponse>(`${API}/entries/${id}`);
}

/** Creates a journal entry through the local API. */
export async function createEntry(body: PostEntriesRequest): Promise<{ id: string }> {
  return fetchJson<{ id: string }>(`${API}/entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Updates a journal entry content field through the local API. */
export async function updateEntry(id: string, content: string): Promise<GetEntryByIdResponse> {
  return fetchJson<GetEntryByIdResponse>(`${API}/entries/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

/** Deletes a journal entry through the local API. */
export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`${API}/entries/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error((err as { message?: string }).message ?? res.statusText), {
      status: res.status,
    });
  }
}

/** Requests guiding prompts from the local API. */
export async function getPrompts(recentEntries?: string[]): Promise<{ prompts: string[] }> {
  return fetchJson<{ prompts: string[] }>(`${API}/prompts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recentEntries }),
  });
}

/** Loads persisted local model settings. */
export async function getSettings(): Promise<GetSettingsResponse> {
  return fetchJson<GetSettingsResponse>(`${API}/settings`);
}

/** Persists local model settings through the API. */
export async function saveSettings(settings: PutSettingsRequest): Promise<PutSettingsResponse> {
  return fetchJson<PutSettingsResponse>(`${API}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
}

/** Tests the configured local model server connection. */
export async function testConnection(
  settings: PutSettingsRequest,
): Promise<PostSettingsTestResponse> {
  return fetchJson<PostSettingsTestResponse>(`${API}/settings/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
}

/** Computes the consecutive daily journaling streak from entry dates. */
export function computeStreak(entries: JournalEntry[]): number {
  if (!entries.length) return 0;
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set(entries.map((e) => dayKey(new Date(e.createdAt))));
  let streak = 0;
  const now = new Date();
  while (true) {
    const d = new Date(now);
    d.setDate(d.getDate() - streak);
    if (days.has(dayKey(d))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Handles lifecycle events from the entry-analysis SSE stream. */
export interface StreamHandlers {
  onConnecting: () => void;
  onLive: (msg: string) => void;
  onProgress: (stage: string, msg: string) => void;
  onComplete: (analysis: EntryAnalysis) => void;
  onError: (msg: string) => void;
}

/** Streams analysis progress for an entry and returns an abort callback. */
export function streamAnalysis(
  entryId: string,
  retry: boolean,
  handlers: StreamHandlers,
): () => void {
  const controller = new AbortController();
  handlers.onConnecting();

  void (async () => {
    try {
      const res = await fetch(`${API}/entries/${entryId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retry }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: res.statusText }));
        handlers.onError((data as { message?: string }).message ?? res.statusText);
        return;
      }

      if (!res.body) {
        handlers.onError("No response body from server");
        return;
      }

      handlers.onLive("Connected — reading your entry…");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let boundary = buf.indexOf("\n\n");
        while (boundary !== -1) {
          const block = buf.slice(0, boundary);
          buf = buf.slice(boundary + 2);

          let eventType = "";
          let eventData = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }

          if (!eventType || !eventData) continue;

          let parsed: AnalysisSseEvent;
          try {
            parsed = JSON.parse(eventData) as AnalysisSseEvent;
          } catch {
            continue;
          }

          if (parsed.event === "status") {
            handlers.onLive(parsed.data.message);
          } else if (parsed.event === "progress") {
            handlers.onProgress(parsed.data.stage, parsed.data.message);
          } else if (parsed.event === "complete") {
            handlers.onComplete(parsed.data.analysis);
          } else if (parsed.event === "error") {
            handlers.onError(parsed.data.error.message);
          }

          boundary = buf.indexOf("\n\n");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError((err as Error).message ?? "Stream connection lost");
      }
    }
  })();

  return () => controller.abort();
}
