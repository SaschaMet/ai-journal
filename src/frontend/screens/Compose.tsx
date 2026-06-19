import { useCallback, useEffect, useRef, useState } from "react";
import { createEntry, getPrompts } from "../api-client";
import { CheckIcon, RefreshIcon } from "../icons";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface ComposeProps {
  nav: (path: string) => void;
  hint: string | null; // seeded follow-up prompt from analysis
}

/** Renders the entry composition flow for free or guided journaling. */
export function Compose({ nav, hint }: ComposeProps) {
  const [mode, setMode] = useState<"free" | "guided">("free");
  const [body, setBody] = useState("");
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGuided = useCallback(() => {
    setLoadingPrompts(true);
    setPrompts(null);
    setSelectedPrompt(null);
    setPromptError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    getPrompts()
      .then((data) => {
        setPrompts(data.prompts);
        setLoadingPrompts(false);
      })
      .catch((err: unknown) => {
        setPromptError(
          err instanceof Error
            ? err.message
            : "Could not reach the local model to generate prompts.",
        );
        setLoadingPrompts(false);
      });
  }, []);

  function chooseMode(m: "free" | "guided") {
    setMode(m);
    if (m === "guided" && !prompts && !loadingPrompts) fetchGuided();
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let payload: Parameters<typeof createEntry>[0];

      if (hint) {
        // Opened from a follow-up prompt — always free write with seeded prompt
        payload = { content: body, mode: "free", seededPrompt: hint };
      } else if (mode === "guided" && prompts) {
        payload = {
          content: body,
          mode: "guided",
          guidingPrompts: prompts,
          ...(selectedPrompt ? { seededPrompt: selectedPrompt } : {}),
        };
      } else {
        payload = { content: body, mode: "free" };
      }

      const { id } = await createEntry(payload);
      nav(`/entry/${id}`);
    } catch (err) {
      setSubmitError((err as Error).message ?? "Could not save entry");
      setSubmitting(false);
    }
  }

  const words = wordCount(body);
  const canSubmit = body.trim().length > 0 && !submitting;

  return (
    <main className="page">
      <div className="col">
        {/* Header row: date + mode toggle */}
        <div className="cmp-head">
          <div className="cmp-date">{todayLabel()}</div>

          {/* Hide mode toggle when opened from a follow-up hint */}
          {!hint && (
            <div className="seg">
              <button
                className={mode === "free" ? "on" : ""}
                onClick={() => chooseMode("free")}
                type="button"
              >
                Free write
              </button>
              <button
                className={mode === "guided" ? "on" : ""}
                onClick={() => chooseMode("guided")}
                type="button"
              >
                Guided
              </button>
            </div>
          )}
        </div>

        {/* Follow-up hint card */}
        {hint && (
          <div className="hint">
            <span className="bar" />
            <div>
              <div className="ht">Following up on</div>
              <div className="hq">{hint}</div>
            </div>
          </div>
        )}

        {/* Guided prompts area */}
        {!hint && mode === "guided" && (
          <div className="guided-area">
            <div className="guided-label">
              <span>Prompts for you</span>
              {!loadingPrompts && (
                <button className="regen" type="button" onClick={fetchGuided}>
                  <RefreshIcon /> New prompts
                </button>
              )}
            </div>
            {promptError && !loadingPrompts && (
              <div className="prompt-error">
                <span>{promptError}</span>
                <button className="regen" type="button" onClick={fetchGuided}>
                  <RefreshIcon /> Try again
                </button>
              </div>
            )}
            <div className="prompt-cards">
              {loadingPrompts && [0, 1, 2].map((i) => <div key={i} className="prompt-skel" />)}

              {!loadingPrompts &&
                prompts?.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`prompt-card${selectedPrompt === p ? " sel" : ""}`}
                    onClick={() => {
                      setSelectedPrompt(selectedPrompt === p ? null : p);
                      taRef.current?.focus();
                    }}
                  >
                    <span>{p}</span>
                    <span className="pick">{selectedPrompt === p ? <CheckIcon /> : "Use"}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Writing area */}
        <div className="editor">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={hint || selectedPrompt ? "Begin wherever you like…" : "Start writing…"}
            aria-label="Journal entry"
          />
        </div>

        {/* Footer: word count + submit */}
        <div className="cmp-foot">
          <div className="cmp-count">
            {words} {words === 1 ? "word" : "words"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {submitError && (
              <span style={{ fontSize: 13, color: "oklch(0.74 0.08 32)" }}>{submitError}</span>
            )}
            <button
              className="btn btn-accent"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
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
