declare module "thinking-orbs" {
  import type { ComponentType } from "react";

  export type ThinkingOrbState =
    | "working"
    | "searching"
    | "solving"
    | "listening"
    | "connecting"
    | "weaving"
    | "composing"
    | "breathing"
    | "shaping";

  export interface ThinkingOrbProps {
    state?: ThinkingOrbState;
    size?: 64 | 32 | 20;
    theme?: "auto" | "dark" | "light";
  }

  export const ThinkingOrb: ComponentType<ThinkingOrbProps>;
}
