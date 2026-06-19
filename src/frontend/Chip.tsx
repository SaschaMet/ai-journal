import type React from "react";

// Maps known emotion labels to OKLCH hue values.
// For unknown emotions we hash the name to a consistent hue.
const EMOTION_HUES: Record<string, number> = {
  calm: 155,
  hopeful: 92,
  content: 140,
  gratitude: 70,
  joy: 45,
  tender: 350,
  reflective: 200,
  wistful: 330,
  anxious: 290,
  tired: 255,
  restless: 32,
  overwhelmed: 300,
  peaceful: 162,
  happy: 52,
  sad: 222,
  excited: 30,
  proud: 115,
  curious: 210,
  confused: 270,
  frustrated: 18,
  grateful: 72,
};

function hueFor(name: string): number {
  const lower = name.toLowerCase();
  if (lower in EMOTION_HUES) return EMOTION_HUES[lower] as number;
  // Deterministic hash → hue in 0–359
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

interface ChipProps {
  name: string;
}

/** Renders a deterministic color chip for a reflection label. */
export function Chip({ name }: ChipProps) {
  const hue = hueFor(name);
  return (
    <span className="chip" style={{ "--h": hue } as React.CSSProperties}>
      <span className="dot" />
      {name}
    </span>
  );
}
