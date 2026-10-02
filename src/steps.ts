import type { Step } from "./state/store";
import { useStore } from "./state/store";

export const STEPS: { step: Step; name: string }[] = [
  { step: 1, name: "Upload data" },
  { step: 2, name: "Preview data" },
  { step: 3, name: "Variables & settings" },
  { step: 4, name: "Run analysis" },
  { step: 5, name: "View results" },
];

export const STEP_COUNT = STEPS.length;

export function pad(step: number): string {
  return String(step).padStart(2, "0");
}

/** Why a step cannot be opened yet, or null when it can (plan §5.3). */
export function useStepLock(): (step: Step) => string | null {
  const hasSource = useStore((state) => state.source !== null);
  const hasResult = useStore((state) => state.result !== null);
  return (step) => {
    if (step === 1) return null;
    if (!hasSource) return "Upload a dataset first.";
    if (step === 5 && !hasResult) return "Run the analysis first.";
    return null;
  };
}

/** Whether a step's work is complete, for the check mark beside it. */
export function useStepDone(): (step: Step) => boolean {
  const hasSource = useStore((state) => state.source !== null);
  const hasResult = useStore((state) => state.result !== null);
  const step = useStore((state) => state.step);
  return (target) => {
    if (target === 1 || target === 2) return hasSource && step > target;
    if (target === 3 || target === 4) return hasResult;
    return false;
  };
}
