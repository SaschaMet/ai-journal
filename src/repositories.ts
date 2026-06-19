import type { Database } from "bun:sqlite";
import {
  type AnalysisStatus,
  type EntryAnalysis,
  type EntryMode,
  entryAnalysisSchema,
  type JournalEntry,
  journalEntrySchema,
  type LocalModelSettings,
  localModelSettingsSchema,
} from "./api-contract";

export type EntryRow = {
  id: string;
  created_at: string;
  content: string;
  mode: EntryMode;
  seeded_prompt: string | null;
  guiding_prompts_json: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  analysis_json: string | null;
};

export type SettingsRow = {
  base_url: string;
  model: string;
  api_key: string | null;
};

/** Lists entries newest-first from SQLite. */
export function listEntries(db: Database): JournalEntry[] {
  return db
    .query<EntryRow, []>(
      `SELECT
        id,
        created_at,
        content,
        mode,
        seeded_prompt,
        guiding_prompts_json,
        analysis_status,
        analysis_error,
        analysis_json
      FROM entries
      ORDER BY created_at DESC`,
    )
    .all()
    .map(mapEntryRow);
}

/** Reads one entry by ID from SQLite. */
export function getEntryById(db: Database, id: string): JournalEntry | null {
  const row = db
    .query<EntryRow, [string]>(
      `SELECT
        id,
        created_at,
        content,
        mode,
        seeded_prompt,
        guiding_prompts_json,
        analysis_status,
        analysis_error,
        analysis_json
      FROM entries
      WHERE id = ?
      LIMIT 1`,
    )
    .get(id);

  return row ? mapEntryRow(row) : null;
}

/** Inserts a new journal entry with idle analysis state. */
export function createEntry(
  db: Database,
  input: {
    content: string;
    mode: EntryMode;
    guidingPrompts?: string[] | undefined;
    seededPrompt?: string | undefined;
  },
): JournalEntry {
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    content: input.content,
    mode: input.mode,
    analysisStatus: "idle",
  };

  if (input.guidingPrompts) {
    entry.guidingPrompts = input.guidingPrompts;
  }

  if (input.seededPrompt) {
    entry.seededPrompt = input.seededPrompt;
  }

  db.query(
    `INSERT INTO entries (
      id,
      created_at,
      content,
      mode,
      seeded_prompt,
      guiding_prompts_json,
      analysis_status,
      analysis_error,
      analysis_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.createdAt,
    entry.content,
    entry.mode,
    entry.seededPrompt ?? null,
    entry.guidingPrompts ? JSON.stringify(entry.guidingPrompts) : null,
    entry.analysisStatus,
    null,
    null,
  );

  return entry;
}

/** Updates analysis status and clears stale analysis on non-done states. */
export function updateEntryAnalysisStatus(
  db: Database,
  id: string,
  status: AnalysisStatus,
  analysisError?: string,
): void {
  db.query(
    `UPDATE entries
    SET analysis_status = ?, analysis_error = ?, analysis_json = CASE WHEN ? = 'done' THEN analysis_json ELSE NULL END
    WHERE id = ?`,
  ).run(status, analysisError ?? null, status, id);
}

/** Updates entry content and returns the refreshed entry. */
export function updateEntryContent(db: Database, id: string, content: string): JournalEntry | null {
  db.query(`UPDATE entries SET content = ? WHERE id = ?`).run(content, id);
  return getEntryById(db, id);
}

/** Deletes an entry by ID. */
export function deleteEntry(db: Database, id: string): void {
  db.query(`DELETE FROM entries WHERE id = ?`).run(id);
}

/** Persists validated AI analysis for an entry. */
export function saveEntryAnalysis(db: Database, id: string, analysis: EntryAnalysis): void {
  db.query(
    `UPDATE entries
    SET analysis_status = 'done', analysis_error = NULL, analysis_json = ?
    WHERE id = ?`,
  ).run(JSON.stringify(entryAnalysisSchema.parse(analysis)), id);
}

/** Reads the singleton local model settings row. */
export function getSettings(db: Database): LocalModelSettings | null {
  const row = db
    .query<SettingsRow, []>(
      `SELECT base_url, model, api_key
      FROM settings
      WHERE id = 1
      LIMIT 1`,
    )
    .get();

  if (!row) {
    return null;
  }

  return localModelSettingsSchema.parse({
    baseUrl: row.base_url,
    model: row.model,
    apiKey: row.api_key ?? undefined,
  });
}

/** Validates and upserts the singleton local model settings row. */
export function upsertSettings(db: Database, settings: LocalModelSettings): LocalModelSettings {
  const parsed = localModelSettingsSchema.parse(settings);

  db.query(
    `INSERT INTO settings (id, base_url, model, api_key)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      base_url = excluded.base_url,
      model = excluded.model,
      api_key = excluded.api_key`,
  ).run(parsed.baseUrl, parsed.model, parsed.apiKey ?? null);

  return parsed;
}

function mapEntryRow(row: EntryRow): JournalEntry {
  return journalEntrySchema.parse({
    id: row.id,
    createdAt: row.created_at,
    content: row.content,
    mode: row.mode,
    seededPrompt: row.seeded_prompt ?? undefined,
    guidingPrompts: row.guiding_prompts_json ? JSON.parse(row.guiding_prompts_json) : undefined,
    analysisStatus: row.analysis_status,
    analysisError: row.analysis_error ?? undefined,
    analysis: row.analysis_json ? JSON.parse(row.analysis_json) : undefined,
  });
}
