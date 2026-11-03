"use client";

import { useEffect, useState, type ComponentType } from "react";

export type OrbState =
  | "working"
  | "searching"
  | "solving"
  | "listening"
  | "connecting"
  | "weaving"
  | "composing"
  | "breathing"
  | "shaping";

interface OrbProps {
  state?: OrbState;
  size?: 64 | 32 | 20;
  theme?: "auto" | "dark" | "light";
}

type OrbComponent = ComponentType<OrbProps>;

let cached: OrbComponent | null | undefined;

/**
 * Uses the real `thinking-orbs` package when it loads. If the package
 * cannot load for any reason, a faithful CSS orb (solid ink/forest,
 * breathing sphere with an orbiting dot) is rendered instead — an orb
 * is always visible, never a bare spinner.
 */
export default function Orb({ state = "breathing", size = 64, theme = "auto" }: OrbProps) {
  // () => cached is required: once `cached` holds the component function,
  // passing it bare to useState would make React call it as an initializer.
  const [Real, setReal] = useState<OrbComponent | null | undefined>(() => cached);

  useEffect(() => {
    // NOTE: the component must be wrapped in () => … when stored in state.
    // Passing the function itself makes React invoke it as a state updater
    // with the previous state (undefined) — which crashes the orb component.
    if (cached !== undefined) {
      setReal(() => cached);
      return;
    }
    import("thinking-orbs")
      .then((m) => {
        cached = (m as { ThinkingOrb: OrbComponent }).ThinkingOrb ?? null;
        setReal(() => cached);
      })
      .catch(() => {
        cached = null;
        setReal(() => null);
      });
  }, []);

  if (Real) return <Real state={state} size={size} theme={theme} />;

  const dark = theme === "dark";
  return (
    <span
      className={`css-orb css-orb-${state}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="css-orb-sphere"
        style={{
          background: dark ? "#0C5B3E" : "#141310",
          boxShadow: dark
            ? "inset -8px -10px 0 rgba(0,0,0,.35), inset 6px 8px 0 rgba(255,255,255,.18)"
            : "inset -8px -10px 0 rgba(12,91,62,.55), inset 6px 8px 0 rgba(255,255,255,.14)",
        }}
      />
      <span className="css-orb-dot" style={{ background: "#0C5B3E" }} />
      <style jsx>{`
        .css-orb {
          position: relative;
          display: inline-block;
          flex: 0 0 auto;
        }
        .css-orb-sphere {
          position: absolute;
          inset: 18%;
          border-radius: 50%;
          animation: orbBreathe 2.8s ease-in-out infinite;
        }
        .css-orb-searching .css-orb-sphere,
        .css-orb-working .css-orb-sphere,
        .css-orb-solving .css-orb-sphere,
        .css-orb-connecting .css-orb-sphere,
        .css-orb-composing .css-orb-sphere,
        .css-orb-weaving .css-orb-sphere,
        .css-orb-shaping .css-orb-sphere {
          animation-duration: 1.5s;
        }
        .css-orb-dot {
          position: absolute;
          width: 16%;
          height: 16%;
          border-radius: 50%;
          top: 2%;
          left: 42%;
          transform-origin: 50% 300%;
          animation: orbOrbit 2.6s linear infinite;
        }
        @keyframes orbBreathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
        @keyframes orbOrbit {
          from {
            transform: rotate(0deg) translateY(0);
          }
          to {
            transform: rotate(360deg) translateY(0);
          }
        }
      `}</style>
    </span>
  );
}
