import { useEffect, useState, type ReactNode } from "react";

/**
 * The Loading component's graphic, verbatim from the design system: a small
 * network of coded nodes linking up. Reduced motion shows it connected and
 * still (bundle.css).
 */
function LoadingGraphic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 160" width="280" height="160" aria-hidden="true">
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 2, animationDelay: "0ms" }} d="M60,50 L130,30" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 3, animationDelay: "150ms" }} d="M130,30 L200,55" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 1.5, animationDelay: "300ms" }} d="M200,55 L220,110" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 2.5, animationDelay: "450ms" }} d="M220,110 L140,130" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 1.5, animationDelay: "600ms" }} d="M140,130 L70,110" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 2, animationDelay: "750ms" }} d="M70,110 L60,50" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 1, animationDelay: "900ms" }} d="M130,30 L140,130" />
      <path className="ml-loading-edge" pathLength="100" style={{ strokeWidth: 1, animationDelay: "1050ms" }} d="M60,50 L220,110" />
      {[
        [60, 50, 0],
        [130, 30, 120],
        [200, 55, 240],
        [220, 110, 360],
        [140, 130, 480],
        [70, 110, 600],
      ].map(([cx, cy, delay]) => (
        <g key={`${cx}-${cy}`} className="ml-loading-node" style={{ animationDelay: `${delay}ms` }}>
          <circle cx={cx} cy={cy} r="6" fill="var(--brand)" />
          <ellipse className="ml-loading-node-highlight" cx={cx - 2} cy={cy - 2} rx="2" ry="1.4" />
        </g>
      ))}
    </svg>
  );
}

/**
 * The Loading component on graph paper. It runs only while something is
 * genuinely loading and stops the moment real content replaces it.
 */
export function LoadingNetwork({ caption, children }: { caption: string; children?: ReactNode }) {
  return (
    <div className="ml-loading ml-graph-paper pf-loading">
      <LoadingGraphic />
      <div className="ml-loading__caption" aria-live="polite">
        {caption}
      </div>
      {children}
    </div>
  );
}

/** True only once `active` has held for `delay` ms, so fast loads never flash a loader. */
export function useDelayedFlag(active: boolean, delay = 200): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return active && shown;
}

/**
 * The Loading component sized to a chart: it fills the chart's own box, on
 * graph paper while nothing is there yet, or over a dimmed figure while it is
 * redrawn. If loading runs long, the caption says why.
 */
export function ChartLoading({
  caption,
  slowCaption,
  over = false,
}: {
  caption: string;
  /** Shown instead of the caption once loading has taken 10 seconds. */
  slowCaption?: string;
  /** Sit over an existing figure (a redraw) rather than stand in for one. */
  over?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowCaption) return;
    const timer = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(timer);
  }, [slowCaption]);

  return (
    <div className={`ml-loading pf-chart-loading${over ? " pf-chart-loading--over" : " ml-graph-paper"}`} role="status">
      <LoadingGraphic className="pf-chart-loading__graphic" />
      <div className="ml-loading__caption">{slow && slowCaption ? slowCaption : caption}</div>
    </div>
  );
}
