import { useCallback, useEffect, useReducer, useState } from "react";
import type { JournalEntry } from "../api-contract";
import { computeStreak } from "./api-client";
import { BackIcon, GearIcon, LeafIcon, PlusIcon } from "./icons";
import { Analysis } from "./screens/Analysis";
import { Compose } from "./screens/Compose";
import { ContinueWrite } from "./screens/ContinueWrite";
import { Dashboard } from "./screens/Dashboard";
import { Settings } from "./screens/Settings";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

type Route =
  | { name: "dash" }
  | { name: "compose"; hint: string | null }
  | { name: "analysis"; id: string }
  | { name: "continue"; id: string }
  | { name: "settings" };

function parseRoute(): Route {
  const { pathname, search } = window.location;
  if (pathname === "/settings") return { name: "settings" };
  if (pathname === "/entry/new") {
    const hint = new URLSearchParams(search).get("hint");
    return { name: "compose", hint };
  }
  const continueMatch = pathname.match(/^\/entry\/([^/]+)\/continue$/);
  if (continueMatch?.[1]) return { name: "continue", id: continueMatch[1] };
  const m = pathname.match(/^\/entry\/([^/]+)$/);
  if (m?.[1]) return { name: "analysis", id: m[1] };
  return { name: "dash" };
}

function pushRoute(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/** Renders the top-level journal app shell and route switch. */
export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  // entries cached at app level so we can show the streak in the nav
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  // force re-render when entries change (for streak)
  const [, tick] = useReducer((x: number) => x + 1, 0);

  // Listen for browser back/forward
  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Re-fetch entries whenever we land on the dashboard
  useEffect(() => {
    if (route.name !== "dash") return;
    // Dashboard will call onEntriesLoaded when it fetches
    setEntries(null);
  }, [route.name]);

  const handleEntriesLoaded = useCallback((loaded: JournalEntry[]) => {
    setEntries(loaded);
    tick();
  }, []);

  const nav = useCallback((path: string) => pushRoute(path), []);
  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else pushRoute("/");
  }, []);

  const onDash = route.name === "dash";
  const streak = entries ? computeStreak(entries) : 0;

  let screen: React.ReactNode;
  switch (route.name) {
    case "analysis":
      screen = <Analysis key={route.id} id={route.id} nav={nav} />;
      break;
    case "compose":
      screen = <Compose key={route.hint ?? "new"} hint={route.hint} nav={nav} />;
      break;
    case "continue":
      screen = <ContinueWrite key={route.id} id={route.id} nav={nav} />;
      break;
    case "settings":
      screen = <Settings />;
      break;
    default:
      screen = <Dashboard nav={nav} entries={entries} onEntriesLoaded={handleEntriesLoaded} />;
  }

  return (
    <div id="app">
      {/* ---------- sticky nav ---------- */}
      <header className="nav">
        <div className="nav-left">
          {/* Brand */}
          <button className="brand" type="button" onClick={() => nav("/")}>
            Still<span className="leaf">·</span>
          </button>

          {/* Back button on non-dashboard screens */}
          {!onDash && (
            <button className="nav-back" type="button" onClick={back}>
              <BackIcon /> Back
            </button>
          )}
        </div>

        <div className="nav-right">
          {/* Writing streak — only on dashboard */}
          {onDash && streak > 0 && (
            <span className="streak">
              <LeafIcon />
              <span className="lbl">
                <b>{streak}</b> {streak === 1 ? "day" : "days"} writing
              </span>
            </span>
          )}

          {/* Settings gear — hide on settings page */}
          {route.name !== "settings" && (
            <button
              className="icon-btn"
              type="button"
              aria-label="Settings"
              onClick={() => nav("/settings")}
            >
              <GearIcon />
            </button>
          )}

          {/* New entry — hide on compose and continue pages */}
          {route.name !== "compose" && route.name !== "continue" && (
            <button className="btn btn-accent" type="button" onClick={() => nav("/entry/new")}>
              <PlusIcon /> <span className="lbl">New entry</span>
            </button>
          )}
        </div>
      </header>

      {screen}
    </div>
  );
}
