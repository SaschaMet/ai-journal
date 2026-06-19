import { useCallback, useEffect, useRef, useState } from "react";
import type { EntryAnalysis, JournalEntry } from "../../api-contract";
import { deleteEntry, getEntryById, streamAnalysis, updateEntry } from "../api-client";
import { Chip } from "../Chip";
import { ArrowIcon } from "../icons";

type ConnState = "connecting" | "live" | "done" | "error";
type ViewState = "loading" | "streaming" | "saved" | "error";

function formatReadDate(isoDate: string): { date: string; meta: string } {
  const d = new Date(isoDate);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { date, meta: time };
}

function entryParagraphs(content: string): string[] {
  const paras = content
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return paras.length > 0 ? paras : [content];
}

interface AnalysisProps {
  id: string;
  nav: (path: string) => void;
}

/** Renders analysis state and AI reflections for one journal entry. */
export function Analysis({ id, nav }: AnalysisProps) {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [conn, setConn] = useState<ConnState>("connecting");
  const [progressMsg, setProgressMsg] = useState("");
  const [analysis, setAnalysis] = useState<EntryAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [revealed, setRevealed] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [contentUpdated, setContentUpdated] = useState(
    () => new URLSearchParams(window.location.search).get("updated") === "1",
  );

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const stopStreamRef = useRef<(() => void) | null>(null);

  // Cleanup stream on unmount
  useEffect(
    () => () => {
      stopStreamRef.current?.();
    },
    [],
  );

  const startStream = useCallback((entryId: string, retry: boolean) => {
    stopStreamRef.current?.();
    setView("streaming");
    setConn("connecting");
    setProgressMsg("");
    setRevealed(false);

    stopStreamRef.current = streamAnalysis(entryId, retry, {
      onConnecting: () => {
        setConn("connecting");
      },
      onLive: (msg) => {
        setConn("live");
        setProgressMsg(msg);
      },
      onProgress: (_stage, msg) => {
        setProgressMsg(msg);
      },
      onComplete: (result) => {
        setAnalysis(result);
        setConn("done");
        setView("saved");
        setRevealed(true);
        setContentUpdated(false);
      },
      onError: (msg) => {
        setConn("error");
        setErrorMsg(msg);
        setView("error");
      },
    });
  }, []);

  // Load entry on mount
  useEffect(() => {
    let cancelled = false;
    setView("loading");

    getEntryById(id)
      .then(({ entry: e }) => {
        if (cancelled) return;
        setEntry(e);

        if (e.analysisStatus === "done" && e.analysis) {
          setAnalysis(e.analysis);
          setView("saved");
        } else if (e.analysisStatus === "error") {
          setErrorMsg(e.analysisError ?? "Analysis failed");
          setView("error");
        } else {
          // idle or running — trigger the stream
          startStream(e.id, false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setErrorMsg(err.message ?? "Could not load entry");
          setView("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, startStream]);

  const handleRetry = () => {
    if (!entry) return;
    setErrorMsg("");
    startStream(entry.id, true);
  };

  const handleFollowUp = (prompt: string) => {
    nav(`/entry/new?hint=${encodeURIComponent(prompt)}`);
  };

  // Edit handlers
  function handleEditStart() {
    if (!entry) return;
    setEditBody(entry.content);
    setEditMode(true);
    setEditError(null);
    setDeleteConfirm(false);
  }

  function handleEditCancel() {
    setEditMode(false);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!entry || !editBody.trim() || editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const { entry: updated } = await updateEntry(entry.id, editBody);
      setEntry(updated);
      setEditMode(false);
      setContentUpdated(true);
    } catch (err) {
      setEditError((err as Error).message ?? "Could not save");
    } finally {
      setEditSaving(false);
    }
  }

  // Delete handlers
  async function handleDelete() {
    if (!entry || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEntry(entry.id);
      nav("/");
    } catch (err) {
      setDeleteError((err as Error).message ?? "Could not delete");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  // ---- Render ----
  if (view === "loading") {
    return (
      <main className="page">
        <div className="col col--narrow" style={{ paddingTop: 54 }}>
          <div
            className="shimmer"
            style={{ height: 30, width: "40%", borderRadius: 6, color: "transparent" }}
          >
            &nbsp;
          </div>
          <div
            className="shimmer"
            style={{
              height: 16,
              width: "20%",
              borderRadius: 4,
              marginTop: 10,
              color: "transparent",
            }}
          >
            &nbsp;
          </div>
          <div
            className="shimmer"
            style={{ height: 100, borderRadius: 8, marginTop: 28, color: "transparent" }}
          >
            &nbsp;
          </div>
        </div>
      </main>
    );
  }

  const { date: readDate, meta: readMeta } = entry
    ? formatReadDate(entry.createdAt)
    : { date: "", meta: "" };

  const paragraphs = entry ? entryParagraphs(entry.content) : [];
  const emotions = analysis?.reflections.emotions ?? [];
  const themes = analysis?.reflections.themes ?? [];
  const questions = [
    ...(analysis?.reflections.reframes ?? []),
    ...(analysis?.reflections.cognitivePatterns ?? []),
  ];
  const followUps = analysis?.followUpPrompts ?? [];

  const isStreaming = view === "streaming";

  return (
    <main className="page">
      <div className="col col--narrow">
        {/* Entry header */}
        <div className="read-date">{readDate}</div>
        {readMeta && <div className="read-meta">{readMeta}</div>}

        {/* Action bar — edit and delete */}
        {!editMode && entry && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginTop: 10,
              marginBottom: 4,
            }}
          >
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--ink-4)",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "var(--ui)",
              }}
              onClick={handleEditStart}
            >
              Edit
            </button>
            {!deleteConfirm ? (
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--ink-4)",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "var(--ui)",
                }}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete
              </button>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ color: "var(--ink-3)" }}>Delete this entry?</span>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999 }}
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--ink-4)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "var(--ui)",
                  }}
                  onClick={() => {
                    setDeleteConfirm(false);
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </button>
              </span>
            )}
            {deleteError && (
              <span style={{ fontSize: 12, color: "oklch(0.74 0.08 32)" }}>{deleteError}</span>
            )}
          </div>
        )}

        {/* Entry body — editable or read-only */}
        {editMode ? (
          <div style={{ marginTop: 16 }}>
            <div className="editor" style={{ marginTop: 0 }}>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                aria-label="Edit journal entry"
                style={{ minHeight: 220 }}
              />
            </div>
            {editError && (
              <p
                style={{
                  color: "oklch(0.74 0.08 32)",
                  fontSize: 13,
                  marginTop: 6,
                  marginBottom: 0,
                }}
              >
                {editError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                className="btn btn-accent"
                onClick={() => void handleEditSave()}
                disabled={editSaving || !editBody.trim()}
                type="button"
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleEditCancel}
                disabled={editSaving}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="read-body">
            {paragraphs.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: paragraph index is stable
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {/* Emotion chips (only when analysis is done) */}
        {view === "saved" && emotions.length > 0 && (
          <div className="read-chips reveal">
            {emotions.map((e) => (
              <Chip key={e} name={e} />
            ))}
          </div>
        )}

        <div className="rule" />

        {/* Re-analyze notice after content update */}
        {contentUpdated && view === "saved" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              marginBottom: 24,
              padding: "12px 16px",
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.4 }}>
              Entry updated — the reflection below may be out of date.
            </span>
            <button
              type="button"
              className="btn btn-accent"
              style={{ fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => {
                if (entry) startStream(entry.id, true);
              }}
            >
              Re-analyze
            </button>
          </div>
        )}

        {/* ---- ERROR state ---- */}
        {view === "error" && (
          <div className="err-box">
            <div className="et">The analysis didn&apos;t finish.</div>
            <div className="ed">
              {errorMsg
                ? errorMsg
                : "The connection to your local model dropped before it completed. Your entry is saved — nothing was lost."}
            </div>
            <button className="btn btn-accent" type="button" onClick={handleRetry}>
              Retry analysis
            </button>
          </div>
        )}

        {/* ---- STREAMING + SAVED share the section label ---- */}
        {view !== "error" && (
          <div>
            <div className="an-label">
              <span className="eyebrow">Reflection</span>
              <span className="ln" />
            </div>

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="stream" style={{ marginBottom: 28 }}>
                <div className="conn">
                  <span className={`led ${conn === "connecting" ? "connecting" : "live"}`} />
                  {conn === "connecting"
                    ? "Connecting to your local model…"
                    : progressMsg || "Streaming…"}
                </div>
                <div className="stream-line">
                  <i />
                </div>
              </div>
            )}

            {/* Summary */}
            {analysis && (
              <div className={`an-sec${revealed ? " reveal" : ""}`}>
                <div className="an-summary">{analysis.summary}</div>
              </div>
            )}

            {/* Themes */}
            {themes.length > 0 && (
              <div className={`an-sec${revealed ? " reveal" : ""}`}>
                <h4>Themes</h4>
                <div className="an-themes">
                  {themes.map((t) => (
                    <span key={t} className="an-theme">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Questions to sit with */}
            {questions.length > 0 && (
              <div className={`an-sec${revealed ? " reveal" : ""}`}>
                <h4>Questions to sit with</h4>
                <ul className="an-q">
                  {questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Continue writing — AI prompts + free continuation */}
            {view === "saved" && (
              <div className={`an-sec${revealed ? " reveal" : ""}`}>
                <h4>Continue writing</h4>
                <div className="an-prompts">
                  {followUps.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="an-prompt"
                      onClick={() => handleFollowUp(p)}
                    >
                      <span>{p}</span>
                      <span className="arr">
                        <ArrowIcon />
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="an-prompt"
                    style={{ opacity: 0.65 }}
                    onClick={() => nav(`/entry/${id}/continue`)}
                  >
                    <span>Continue on your own</span>
                    <span className="arr">
                      <ArrowIcon />
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
