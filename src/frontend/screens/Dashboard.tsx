import { useEffect, useState } from "react";
import type { JournalEntry } from "../../api-contract";
import { computeStreak, getEntries } from "../api-client";
import { Chip } from "../Chip";
import { LeafIcon } from "../icons";

const GREETING_QUESTIONS = [
  "What stayed with you today?",
  "What's worth capturing from today?",
  "What are you carrying into this moment?",
  "What wants to be said right now?",
  "What would future you want to remember?",
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function greetingQuestion(): string {
  // Rotate by day-of-month for variety
  const day = new Date().getDate();
  return GREETING_QUESTIONS[day % GREETING_QUESTIONS.length] ?? "What stayed with you today?";
}

function formatEntryDate(isoDate: string): { label: string; rel: string } {
  const date = new Date(isoDate);
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let rel: string;
  if (diffDays === 0) rel = "Today";
  else if (diffDays === 1) rel = "Yesterday";
  else if (diffDays < 7) rel = `${diffDays} days ago`;
  else if (diffDays < 14) rel = "Last week";
  else rel = `${Math.floor(diffDays / 7)} weeks ago`;

  return { label, rel };
}

function entryPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157).trimEnd()}…`;
}

interface DashboardProps {
  nav: (path: string) => void;
  entries: JournalEntry[] | null;
  onEntriesLoaded: (entries: JournalEntry[]) => void;
}

/** Renders the entry dashboard, streak summary, and recent entries. */
export function Dashboard({ nav, entries, onEntriesLoaded }: DashboardProps) {
  const [loading, setLoading] = useState(entries === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEntries()
      .then((data) => {
        if (!cancelled) {
          onEntriesLoaded(data.entries);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onEntriesLoaded]);

  const streak = entries ? computeStreak(entries) : 0;
  const todayFull = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="page">
      <div className="col">
        <div className="dash-greet">
          {timeGreeting()}.<br />
          <em>{greetingQuestion()}</em>
        </div>
        <div className="dash-sub">
          {todayFull}
          {entries !== null && ` · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </div>
        {streak > 0 && (
          <div className="dash-streak">
            <LeafIcon />
            <span>
              <b>{streak}</b> {streak === 1 ? "day" : "days"} writing
            </span>
          </div>
        )}

        <div className="dash-list">
          {loading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="entry-row" style={{ cursor: "default" }}>
                <div
                  className="entry-date shimmer"
                  style={{ width: 120, height: 13, borderRadius: 4, color: "transparent" }}
                >
                  &nbsp;
                </div>
                <div
                  className="entry-prev shimmer"
                  style={{ height: 50, marginTop: 9, borderRadius: 4, color: "transparent" }}
                >
                  &nbsp;
                </div>
              </div>
            ))}

          {!loading && error && (
            <div className="empty">
              <p>Could not load entries.</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>{error}</p>
            </div>
          )}

          {!loading && !error && entries?.length === 0 && (
            <div className="empty">Nothing written yet — start your first entry.</div>
          )}

          {!loading &&
            !error &&
            entries?.map((entry) => {
              const { label, rel } = formatEntryDate(entry.createdAt);
              const emotions = entry.analysis?.reflections.emotions ?? [];

              return (
                <button
                  key={entry.id}
                  type="button"
                  className="entry-row"
                  onClick={() => nav(`/entry/${entry.id}`)}
                >
                  <div className="entry-date">
                    {rel} · {label}
                  </div>
                  <div className="entry-prev">{entryPreview(entry.content)}</div>

                  {entry.analysisStatus === "done" && emotions.length > 0 && (
                    <div className="entry-foot">
                      {emotions.map((e) => (
                        <Chip key={e} name={e} />
                      ))}
                    </div>
                  )}

                  {(entry.analysisStatus === "idle" || entry.analysisStatus === "running") && (
                    <div className="entry-state">
                      <span className="shimmer">Reading your entry…</span>
                    </div>
                  )}

                  {entry.analysisStatus === "error" && (
                    <div className="entry-state">
                      <span>Analysis didn&apos;t finish.</span>
                      <button
                        type="button"
                        className="entry-retry"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/entry/${entry.id}`);
                        }}
                      >
                        Open to retry
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </main>
  );
}
