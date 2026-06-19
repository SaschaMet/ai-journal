import { useEffect, useRef, useState } from "react";
import type { JournalEntry } from "../../api-contract";
import { getEntryById, updateEntry } from "../api-client";

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function entryParagraphs(content: string): string[] {
  const paras = content
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return paras.length > 0 ? paras : [content];
}

interface ContinueWriteProps {
  id: string;
  nav: (path: string) => void;
}

/** Renders the edit flow for continuing an existing entry. */
export function ContinueWrite({ id, nav }: ContinueWriteProps) {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    getEntryById(id)
      .then(({ entry: e }) => {
        if (!cancelled) {
          setEntry(e);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message ?? "Could not load entry");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    if (!entry || !body.trim() || submitting) return;
    setSubmitting(true);
    setSaveError(null);

    try {
      const combined = `${entry.content}\n\n${body.trim()}`;
      await updateEntry(id, combined);
      nav(`/entry/${id}?updated=1`);
    } catch (err) {
      setSaveError((err as Error).message ?? "Could not save");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <div className="col" style={{ paddingTop: 54 }}>
          <div
            className="shimmer"
            style={{ height: 30, width: "50%", borderRadius: 6, color: "transparent" }}
          >
            &nbsp;
          </div>
          <div
            className="shimmer"
            style={{ height: 120, borderRadius: 8, marginTop: 24, color: "transparent" }}
          >
            &nbsp;
          </div>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <div className="col">
          <div className="err-box">
            <div className="et">Could not load entry</div>
            <div className="ed">{loadError}</div>
          </div>
        </div>
      </main>
    );
  }

  const paragraphs = entry ? entryParagraphs(entry.content) : [];
  const words = wordCount(body);

  return (
    <main className="page">
      <div className="col">
        {/* Previous content — faded, read-only */}
        {paragraphs.length > 0 && (
          <div
            className="read-body"
            style={{ opacity: 0.45, pointerEvents: "none", userSelect: "none" }}
          >
            {paragraphs.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: paragraph index is stable
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {/* Visual divider between old and new */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0 8px" }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-4)",
            }}
          >
            Continue
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        {/* New writing area */}
        <div className="editor">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Continue writing…"
            aria-label="Continue your entry"
            // biome-ignore lint/a11y/noAutofocus: intentional focus for writing flow
            autoFocus
          />
        </div>

        <div className="cmp-foot">
          <div className="cmp-count">
            {words} {words === 1 ? "word" : "words"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {saveError && (
              <span style={{ fontSize: 13, color: "oklch(0.74 0.08 32)" }}>{saveError}</span>
            )}
            <button
              className="btn btn-accent"
              disabled={!body.trim() || submitting}
              onClick={() => void handleSave()}
              type="button"
            >
              {submitting ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
