import type { Transition } from "framer-motion";

/** Shared springs so every surface moves with the same feel. */
export const spring = {
  /** Page and pane changes. */
  page: { type: "spring", stiffness: 380, damping: 34, mass: 0.9 },
  /** Sheets sliding up from the bottom. */
  sheet: { type: "spring", stiffness: 420, damping: 40, mass: 1 },
  /** Small indicators: tab pills, toggles. */
  snappy: { type: "spring", stiffness: 520, damping: 36, mass: 0.7 },
} as const satisfies Record<string, Transition>;
