import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDatabase } from "./db/migrate";
import { createEntry, getSettings, listEntries, upsertSettings } from "./repositories";

type TestDatabase = {
  db: Database;
  directory: string;
};

const testDatabases: TestDatabase[] = [];

function createTestDatabase(): Database {
  const directory = mkdtempSync(join(tmpdir(), "ai-journal-test-"));
  const db = openDatabase(join(directory, "journal.sqlite"));
  migrate(db);
  testDatabases.push({ db, directory });
  return db;
}

afterEach(() => {
  while (testDatabases.length > 0) {
    const testDatabase = testDatabases.pop();
    if (!testDatabase) {
      continue;
    }

    testDatabase.db.close();
    rmSync(testDatabase.directory, { recursive: true, force: true });
  }
});

describe("repositories", () => {
  test("creates idle entries and lists newest first", () => {
    const db = createTestDatabase();
    const older = createEntry(db, {
      content: "Older entry",
      mode: "free",
    });
    const newer = createEntry(db, {
      content: "Newer entry",
      mode: "guided",
      guidingPrompts: ["What changed?"],
    });

    db.query("UPDATE entries SET created_at = ? WHERE id = ?").run(
      "2024-01-01T00:00:00.000Z",
      older.id,
    );
    db.query("UPDATE entries SET created_at = ? WHERE id = ?").run(
      "2024-01-02T00:00:00.000Z",
      newer.id,
    );

    expect(older.analysisStatus).toBe("idle");
    expect(listEntries(db).map((entry) => entry.id)).toEqual([newer.id, older.id]);
  });

  test("persists singleton local model settings", () => {
    const db = createTestDatabase();

    upsertSettings(db, {
      baseUrl: "http://localhost:11434",
      model: "local-model",
    });

    expect(getSettings(db)).toEqual({
      baseUrl: "http://localhost:11434",
      model: "local-model",
    });
  });
});
