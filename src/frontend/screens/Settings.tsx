import { useEffect, useRef, useState } from "react";
import { getSettings, saveSettings, testConnection } from "../api-client";
import { AlertIcon, CheckIcon, LockIcon } from "../icons";

type TestState = "idle" | "testing" | "ok" | "fail";

/** Renders model endpoint settings and connection validation controls. */
export function Settings() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current settings on mount
  useEffect(() => {
    getSettings()
      .then(({ settings }) => {
        if (settings) {
          setBaseUrl(settings.baseUrl);
          setModel(settings.model);
          setApiKey(settings.apiKey ?? "");
        }
      })
      .catch(() => {
        /* ignore — form starts with defaults */
      });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleTest() {
    if (!baseUrl.trim() || !model.trim()) return;
    setTestState("testing");
    setTestMsg("");
    try {
      const result = await testConnection({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      if (result.ok) {
        setTestState("ok");
        setTestMsg(`Connected · ${result.latencyMs} ms · ${result.provider.model} ready`);
      } else {
        setTestState("fail");
        setTestMsg(result.error?.message ?? "Connection failed");
      }
    } catch (err) {
      setTestState("fail");
      setTestMsg((err as Error).message ?? "Connection failed");
    }
  }

  async function handleSave() {
    if (!baseUrl.trim() || !model.trim() || saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await saveSettings({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setSaveMsg("Settings saved.");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setSaveMsg((err as Error).message ?? "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <div className="col col--narrow">
        <div className="set-title">Settings</div>
        <div className="set-sub">
          Point the journal at your local model. Everything stays on this device.
        </div>

        {/* Endpoint URL */}
        <div className="field">
          <label htmlFor="set-url">Endpoint URL</label>
          <div className="desc">
            The base URL of your local, OpenAI-compatible server (LM Studio, Ollama, llama.cpp…).
          </div>
          <input
            id="set-url"
            className="input"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            placeholder="http://localhost:1234/v1"
          />
        </div>

        {/* Model name */}
        <div className="field">
          <label htmlFor="set-model">Model name</label>
          <div className="desc">Whichever model you have loaded locally.</div>
          <input
            id="set-model"
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            spellCheck={false}
            placeholder="llama3.2"
          />
        </div>

        {/* API key (optional) */}
        <div className="field">
          <label htmlFor="set-key">
            API key <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>· optional</span>
          </label>
          <div className="desc">
            Only needed if your local server requires one. Stored locally, never sent anywhere else.
          </div>
          <input
            id="set-key"
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="—"
            autoComplete="off"
          />
        </div>

        {/* Actions */}
        <div className="set-row">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={testState === "testing" || !baseUrl.trim() || !model.trim()}
            onClick={() => void handleTest()}
          >
            {testState === "testing" ? "Testing…" : "Test connection"}
          </button>

          <button
            className="btn btn-accent"
            type="button"
            disabled={saving || !baseUrl.trim() || !model.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          {saveMsg && (
            <span
              style={{
                fontSize: 13,
                color: saveMsg.startsWith("Settings") ? "var(--accent)" : "oklch(0.74 0.08 32)",
              }}
            >
              {saveMsg}
            </span>
          )}
        </div>

        {/* Test result */}
        {testState === "testing" && (
          <div className="set-row" style={{ marginTop: 8 }}>
            <span className="test-state">
              <span
                className="led"
                style={{
                  background: "oklch(0.78 0.06 85)",
                  animation: "pulse 1.1s ease-in-out infinite",
                }}
              />
              Reaching {baseUrl.replace(/^https?:\/\//, "").split("/")[0]}…
            </span>
          </div>
        )}
        {testState === "ok" && (
          <div className="set-row" style={{ marginTop: 8 }}>
            <span className="test-state ok">
              <CheckIcon /> {testMsg}
            </span>
          </div>
        )}
        {testState === "fail" && (
          <div className="set-row" style={{ marginTop: 8 }}>
            <span className="test-state fail">
              <span className="led" style={{ background: "oklch(0.7 0.08 32)" }} />
              {testMsg}
            </span>
          </div>
        )}

        {/* Callouts */}
        <div className="callout warn">
          <span className="ico">
            <AlertIcon />
          </span>
          <div>
            <div className="ct">Localhost connections only</div>
            <div className="cb">
              For your privacy, the journal will refuse any endpoint that isn&apos;t on this
              machine. Remote URLs are blocked by design.
            </div>
          </div>
        </div>

        <div className="callout priv">
          <span className="ico">
            <LockIcon />
          </span>
          <div>
            <div className="ct">Your writing never leaves this device</div>
            <div className="cb">
              Entries are stored locally and analyzed by the model you run yourself. There is no
              cloud, no account, and no telemetry.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
