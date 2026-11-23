"use client";

import Orb, { type OrbState } from "./Orb";
import { useEffect, useState } from "react";

export function useStepCycle(steps: string[], active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    setIndex(0);
    const interval = setInterval(() => setIndex(value => (value + 1) % steps.length), 1100);
    return () => clearInterval(interval);
  }, [active, steps.length]);
  return steps[index];
}

export function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="back-row"><button className="back-btn" onClick={onClick}><span className="chev">‹</span> {label}</button></div>;
}

export function OrbPanel({ state, text, sub }: { state: OrbState; text: string; sub?: string }) {
  return <div className="orb-panel"><Orb state={state} size={64} theme="dark" /><div><div className="step-text">{text}</div>{sub && <div className="step-sub">{sub}</div>}</div></div>;
}
