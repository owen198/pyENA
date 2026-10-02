import type { CSSProperties, ReactNode } from "react";
import { useIsStale, useIssues } from "../state/issues";
import { useStore, type Step } from "../state/store";
import { pad, STEP_COUNT, STEPS, useStepDone, useStepLock } from "../steps";
import { ArrowIcon, CheckIcon, NetworkBloom } from "../ui/marks";
import { Tip } from "../ui/primitives";

/**
 * The progress band: Previous, the five steps by name, Next. Structural
 * numbering, not a progress bar (plan §10.1), on brand-surface so it reads as
 * the one navigational band of the working product.
 */
export function Stepper() {
  const step = useStore((state) => state.step);
  const setStep = useStore((state) => state.setStep);
  const lock = useStepLock();
  const done = useStepDone();
  const current = STEPS.find((entry) => entry.step === step)!;

  return (
    <nav className="pf-band" aria-label="Analysis steps">
      <div className="pf-band__side">
        {step > 1 && (
          <button
            type="button"
            className="ml-btn ml-btn--secondary pf-band__btn"
            aria-label={`Previous step: ${STEPS[step - 2].name}`}
            onClick={() => setStep((step - 1) as Step)}
          >
            <ArrowIcon size={18} className="pf-icon--back" />
            <span className="pf-band__btn-label">Previous</span>
          </button>
        )}
        <Flowers side="start" />
      </div>

      <ol className="pf-band__steps">
        {STEPS.map((entry) => {
          const reason = lock(entry.step);
          const isCurrent = entry.step === step;
          const isDone = done(entry.step) && !isCurrent;
          const button = (
            <button
              type="button"
              className={`pf-band__step${isDone ? " is-done" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={reason !== null || undefined}
              onClick={() => reason === null && setStep(entry.step)}
            >
              <span className="metadata">{pad(entry.step)}</span>
              <span className="pf-band__name">{entry.name}</span>
              {isDone && (
                <>
                  <CheckIcon size={16} />
                  <span className="pf-visually-hidden">, complete</span>
                </>
              )}
            </button>
          );
          return (
            <li key={entry.step} className={isCurrent ? "is-current" : undefined}>
              {reason ? <Tip text={reason}>{button}</Tip> : button}
            </li>
          );
        })}
      </ol>

      <div className="pf-band__side pf-band__side--end">
        <Flowers side="end" />
        <NextButton />
      </div>
      <span className="pf-visually-hidden" aria-live="polite">
        Step {pad(step)} of {pad(STEP_COUNT)}, {current.name}
      </span>
    </nav>
  );
}

/**
 * Small Network bloom flowers in a lane beside the steps, whole and never
 * behind text. Each drifts slowly left to right and back, and blooms, holds
 * while its nodes breathe, folds away and blooms again on a slow cycle.
 */
function Flowers({ side }: { side: "start" | "end" }) {
  const flowers: { small?: boolean; bloom: string; drift: string; speed: string; turn: string }[] =
    side === "start"
      ? [
          { bloom: "0s", drift: "0s", speed: "13s", turn: "rotate(-6deg)" },
          { small: true, bloom: "3s", drift: "-6s", speed: "17s", turn: "rotate(5deg) scaleX(-1)" },
        ]
      : [
          { small: true, bloom: "1.5s", drift: "-3s", speed: "15s", turn: "rotate(-4deg)" },
          { bloom: "4.5s", drift: "-9s", speed: "19s", turn: "rotate(7deg) scaleX(-1)" },
        ];
  return (
    <span className={`pf-flowers pf-flowers--${side}`} aria-hidden="true">
      {flowers.map((flower, index) => (
        <span
          key={index}
          className={`pf-drift${flower.small ? " pf-drift--small" : ""}`}
          style={{ ["--drift-delay" as string]: flower.drift, ["--drift-speed" as string]: flower.speed } as CSSProperties}
        >
          <NetworkBloom
            className="pf-flower"
            style={{ ["--d" as string]: flower.bloom, transform: flower.turn } as CSSProperties}
          />
        </span>
      ))}
    </span>
  );
}

/** Next moves forward; on Run analysis it runs it. Never a silent dead control. */
function NextButton() {
  const step = useStore((state) => state.step);
  const setStep = useStore((state) => state.setStep);
  const runAnalysis = useStore((state) => state.runAnalysis);
  const running = useStore((state) => state.run.status === "running");
  const hasResult = useStore((state) => state.result !== null);
  const engineFailed = useStore((state) => state.engine.state === "failed");
  const issues = useIssues();
  const stale = useIsStale();
  const lock = useStepLock();

  if (step === STEP_COUNT) return null;

  let label: ReactNode;
  let reason: string | null;
  let action: () => void;
  if (step === 4 && (!hasResult || stale || running)) {
    label = running ? "Running…" : hasResult ? "Re-run" : "Run analysis";
    reason = running
      ? "The analysis is running."
      : engineFailed
        ? "The analysis engine failed to load. Reload the page to try again."
        : (issues[0]?.message ?? null);
    action = () => void runAnalysis();
  } else {
    const next = STEPS[step];
    // The band already names every step, so the button says only "Next"; its
    // destination is part of its accessible name.
    label = (
      <>
        Next<span className="pf-visually-hidden">: {next.name}</span>
      </>
    );
    reason = lock(next.step);
    action = () => setStep(next.step);
  }

  const button = (
    <button
      type="button"
      className="ml-btn ml-btn--primary pf-band__btn"
      aria-disabled={reason !== null || undefined}
      onClick={() => reason === null && action()}
    >
      <span className="pf-band__btn-label">{label}</span>
      <ArrowIcon size={18} />
    </button>
  );
  return reason ? (
    <Tip text={reason} align="end">
      {button}
    </Tip>
  ) : (
    button
  );
}
