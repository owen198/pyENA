import { useEffect, useId, useMemo, useState } from "react";
import { PYENA_COMMIT } from "../../engine/version";
import { downloadFigure, downloadFigure3d, figureContext } from "../../results/exports";
import {
  FIGURES,
  FIGURES_3D,
  figureProvenance,
  type Figure3dSpec,
  type FigureId,
  type FigureSpec,
  type LegendKind,
} from "../../results/figures";
import { Plot3D } from "./Plot3D";
import { ChartLoading, useDelayedFlag } from "../canvas/LoadingNetwork";
import { DownloadIcon } from "../../ui/marks";
import { useStore } from "../../state/store";
import { figureTitle, useConnection, useIsInterpreting } from "../../interpret/connection";
import { edgeTarget } from "../../interpret/evidence";
import type { InterpretTarget } from "../../../shared/api";
import { Field, FlagNote } from "../../ui/primitives";

/** The figures from pyENA's own plotting functions, as SVG on graph paper (plan §11.3). */
export function NetworkTab() {
  const result = useStore((state) => state.result)!;
  const redraw = useStore((state) => state.redraw);
  const sections = useMemo(() => [...new Set(FIGURES.map((figure) => figure.section))], []);
  const { group_a_label: a, group_b_label: b } = result.summary.groups;

  return (
    <>
      {redraw.status === "drawing" && (
        <p className="small pf-note" role="status" style={{ marginBottom: "var(--space-4)" }}>
          Redrawing the figures…
        </p>
      )}
      {redraw.status === "error" && redraw.message && <FlagNote>{redraw.message}</FlagNote>}
      {result.model.dimensions === 3 ? <Networks3D /> : <Try3D />}
      {sections.map((section) => (
        <section className="pf-section" key={section} aria-label={section}>
          <div className="pf-section__head">
            <h3 className="pf-section__title">{section}</h3>
          </div>
          {section === "Individual comparison" && (
            <div className="pf-pickers" data-tour="unit-picker">
              <UnitPicker side={0} group={a} units={result.units.filter((unit) => unit.group === a)} />
              <UnitPicker side={1} group={b} units={result.units.filter((unit) => unit.group === b)} />
            </div>
          )}
          <div className="pf-figgrid">
            {FIGURES.filter((figure) => figure.section === section).map((figure) => (
              <Figure key={figure.id} spec={figure} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** From a two-dimensional result, one step to the same model with a Z axis. */
function Try3D() {
  const updateModel = useStore((state) => state.updateModel);
  const runAnalysis = useStore((state) => state.runAnalysis);
  const running = useStore((state) => state.run.status === "running");
  return (
    <div className="pf-callout pf-try3d">
      <div className="pf-stack">
        <p className="label">See this model in 3D</p>
        <p className="small pf-note">
          Run it again with three dimensions for a Z axis and networks you can rotate with the mouse, drawn by pyENA's
          plot3d module. The 2D figures stay.
        </p>
      </div>
      <button
        type="button"
        className="ml-btn ml-btn--secondary"
        data-tour="run-3d"
        disabled={running}
        onClick={() => {
          updateModel({ dimensions: 3 });
          void runAnalysis();
        }}
      >
        Run in 3D
      </button>
    </div>
  );
}

/** The Z axis: pyENA's interactive 3D networks, for a model built with three dimensions. */
function Networks3D() {
  const plots3d = useStore((state) => state.plots3d);
  const plots3dError = useStore((state) => state.plots3dError);
  const redraw3d = useStore((state) => state.redraw3d);
  const [lead, ...rest] = FIGURES_3D;
  return (
    <section className="pf-section" aria-label="3D networks">
      <div className="pf-section__head">
        <h3 className="pf-section__title">3D networks</h3>
        <span className="metadata pf-ink-secondary">Dimensions 1, 2 and 3 (x, y, z)</span>
      </div>
      <p className="small pf-ink-secondary pf-section__lead">
        The same model on all three of its dimensions, drawn by pyENA's plot3d module. Hover a node, edge or point for its
        coordinates. The two-dimensional figures below show dimensions 1 and 2.
      </p>
      {plots3dError ? (
        <div className="pf-stack">
          <FlagNote>The 3D networks could not be drawn: {plots3dError}</FlagNote>
          <button type="button" className="ml-btn ml-btn--secondary" style={{ alignSelf: "flex-start" }} onClick={redraw3d}>
            Try again
          </button>
        </div>
      ) : Object.keys(plots3d).length === 0 ? (
        <FlagNote>The 3D networks are not in this result. Run the analysis again to draw them.</FlagNote>
      ) : (
        <>
          <Figure3D spec={lead} json={plots3d[lead.id]} />
          <div className="pf-figgrid" style={{ marginTop: "var(--space-6)" }}>
            {rest.map((spec) => (
              <Figure3D key={spec.id} spec={spec} json={plots3d[spec.id]} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Figure3D({ spec, json }: { spec: Figure3dSpec; json: string | undefined }) {
  const request = useConnection((state) => state.request);
  // The edge being interpreted, highlighted in every 3D figure.
  const highlight = useConnection((state) => (state.open && state.active?.kind === "edge" ? state.active.codes : null));
  const result = useStore((state) => state.result)!;
  const figures = useStore((state) => state.figures);
  const focusUnits = useStore((state) => state.focusUnits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = figureContext(result, focusUnits);

  return (
    <figure className="pf-figure" data-figure={spec.id}>
      <figcaption className="small pf-figure__caption">{spec.caption(ctx)}</figcaption>
      {json ? (
        <Plot3D figureJson={json} label={spec.alt(ctx)} onEdgeClick={(codes) => request(edgeTarget(codes[0], codes[1]))} highlight={highlight} />
      ) : (
        <div className="pf-plot3d__stage pf-plot3d__stage--placeholder">
          <ChartLoading caption="Drawing the 3D network…" slowCaption="Still drawing the 3D network. The first 3D run also installs the plotting library." />
        </div>
      )}
      <Legend kind={spec.legend} a={ctx.a} b={ctx.b} focusA={null} focusB={null} />
      <span className="metadata pf-figure__meta">{figureProvenance(result.model, PYENA_COMMIT)}</span>
      <span className="pf-figure__actions">
        <button
          type="button"
          className="ml-btn ml-btn--secondary pf-download"
          disabled={busy}
          title={`${spec.file(ctx)}.html`}
          aria-label={`Download ${spec.file(ctx)}.html, the interactive 3D page`}
          onClick={() => {
            setBusy(true);
            setError(null);
            downloadFigure3d(spec.id, result, figures, focusUnits)
              .catch((reason: Error) => setError(reason.message))
              .finally(() => setBusy(false));
          }}
        >
          <DownloadIcon size={16} />
          {busy ? "Preparing…" : "Download interactive page (HTML)"}
        </button>
      </span>
      {error && <FlagNote>{error}</FlagNote>}
    </figure>
  );
}

function UnitPicker({ side, group, units }: { side: 0 | 1; group: string; units: { label: string }[] }) {
  const id = useId();
  const focus = useStore((state) => state.focusUnits[side]);
  const setFocusUnit = useStore((state) => state.setFocusUnit);
  return (
    <Field label={`Unit from ${group}`} htmlFor={id} hint={`${units.length} units in ${group}.`} wide>
      <select id={id} className="ml-input" value={focus ?? ""} onChange={(event) => setFocusUnit(side, event.target.value)}>
        {units.map((unit) => (
          <option key={unit.label} value={unit.label}>
            {unit.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * A figure's plot box. The loader shows until the image has actually
 * displayed, sits over the old figure while it is redrawn, and a figure that
 * fails to display says so and can be drawn again.
 */
function FigurePlot({ id, src, alt }: { id: FigureId; src: string | null; alt: string }) {
  const redrawing = useStore((state) => state.redrawing.includes(id));
  const redrawFigure = useStore((state) => state.redrawFigure);
  const [status, setStatus] = useState<"loading" | "shown" | "failed">("loading");

  useEffect(() => setStatus("loading"), [src]);

  const waiting = useDelayedFlag(!src || status === "loading");
  const redrawShown = useDelayedFlag(redrawing && status === "shown");

  return (
    // A paper plate in either theme: pyENA draws its figures transparent, in paper colours (theme.css).
    <div
      className={`pf-figure__plot${redrawShown ? " is-redrawing" : ""}`}
      data-theme="paper"
      aria-busy={waiting || redrawShown}
    >
      {src && status !== "failed" && (
        <img src={src} alt={alt} onLoad={() => setStatus("shown")} onError={() => setStatus("failed")} />
      )}
      {waiting && status !== "failed" && (
        <ChartLoading caption="Drawing the figure…" slowCaption="Still drawing. The analysis engine is busy; the figure appears as soon as it is ready." />
      )}
      {redrawShown && <ChartLoading over caption="Redrawing…" />}
      {status === "failed" && (
        <div className="pf-chart-failed" role="alert">
          <FlagNote>This figure could not be displayed.</FlagNote>
          <button
            type="button"
            className="ml-btn ml-btn--secondary"
            onClick={() => {
              setStatus("loading");
              redrawFigure([id]);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function Figure({ spec }: { spec: FigureSpec }) {
  const result = useStore((state) => state.result)!;
  const svg = useStore((state) => state.svgs[spec.id]);
  const figures = useStore((state) => state.figures);
  const focusUnits = useStore((state) => state.focusUnits);
  const [busy, setBusy] = useState<"svg" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = figureContext(result, focusUnits);
  const src = useMemo(() => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null), [svg]);
  const request = useConnection((state) => state.request);
  const target: InterpretTarget = { kind: "figure", figureId: spec.id, title: figureTitle(spec.id, ctx.a, ctx.b) };
  const interpreting = useIsInterpreting(target);
  const interpret = () => request(target);

  const save = (format: "svg" | "png") => {
    setBusy(format);
    setError(null);
    downloadFigure(spec.id as FigureId, format, result, figures, focusUnits)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setBusy(null));
  };

  return (
    <figure className={`pf-figure${interpreting ? " is-interpreting" : ""}`} data-figure={spec.id}>
      <figcaption className="small pf-figure__caption">{spec.caption(ctx)}</figcaption>
      {/* The figure itself is for looking; asking about it is the Ask button below (src/components/interpret). */}
      <div className="pf-figure__click" data-tour="figure-click">
        <FigurePlot id={spec.id} src={src} alt={spec.alt(ctx)} />
      </div>
      <Legend kind={spec.legend} a={ctx.a} b={ctx.b} focusA={ctx.focusA} focusB={ctx.focusB} />
      <span className="metadata pf-figure__meta">{figureProvenance(result.model, PYENA_COMMIT)}</span>
      <span className="pf-figure__actions">
        <button type="button" className="ml-btn ml-btn--secondary pf-ask" aria-pressed={interpreting} onClick={interpret} data-tour="figure-ask">
          {interpreting ? "Asking about this figure" : "Ask about this figure"}
        </button>
        <button
          type="button"
          className="ml-btn ml-btn--secondary pf-download"
          disabled={busy !== null}
          title={`${spec.file(ctx)}.svg`}
          aria-label={`Download ${spec.file(ctx)}.svg`}
          onClick={() => save("svg")}
        >
          <DownloadIcon size={16} />
          {busy === "svg" ? "Preparing…" : "Download SVG"}
        </button>
        <button
          type="button"
          className="ml-btn ml-btn--secondary pf-download"
          disabled={busy !== null}
          title={`${spec.file(ctx)}.png`}
          aria-label={`Download ${spec.file(ctx)}.png at 300 dpi`}
          onClick={() => save("png")}
        >
          <DownloadIcon size={16} />
          {busy === "png" ? "Preparing…" : "Download PNG (300 dpi)"}
        </button>
      </span>
      {error && <FlagNote>{error}</FlagNote>}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Legend: colour always paired with a marker shape or a sign (plan §11.3).
// ---------------------------------------------------------------------------

type Shape = "circle" | "square" | "triangle" | "diamond" | "line" | "box";

function Swatch({ shape, color }: { shape: Shape; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {shape === "circle" && <circle cx="8" cy="8" r="4.5" fill={color} opacity="0.75" />}
      {shape === "square" && <rect x="2.5" y="2.5" width="11" height="11" fill={color} stroke="var(--ink)" />}
      {shape === "triangle" && <path d="M8 2.5 L13.5 13 L2.5 13 Z" fill={color} opacity="0.75" />}
      {shape === "diamond" && <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" fill={color} stroke="var(--ink)" />}
      {shape === "line" && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" />}
      {shape === "box" && <rect x="2" y="2" width="12" height="12" fill="none" stroke="var(--ink-secondary)" strokeDasharray="3 2" />}
    </svg>
  );
}

function Legend({
  kind,
  a,
  b,
  focusA,
  focusB,
}: {
  kind: LegendKind;
  a: string;
  b: string;
  focusA: string | null;
  focusB: string | null;
}) {
  const { colorA, colorB, showCI } = useStore((state) => state.figures);
  const items: { shape: Shape; color: string; label: string }[] = [];
  const edgesA = { shape: "line" as const, color: colorA, label: `+ Stronger in ${a}` };
  const edgesB = { shape: "line" as const, color: colorB, label: `− Stronger in ${b}` };
  const pointsA = { shape: "circle" as const, color: colorA, label: `${a} unit` };
  const pointsB = { shape: "triangle" as const, color: colorB, label: `${b} unit` };
  const meanA = { shape: "square" as const, color: colorA, label: `${a} mean` };
  const meanB = { shape: "diamond" as const, color: colorB, label: `${b} mean` };
  const ci = { shape: "box" as const, color: "", label: "95% confidence interval" };
  const weightsA = { shape: "line" as const, color: colorA, label: `Mean edge weight, ${a}` };
  const weightsB = { shape: "line" as const, color: colorB, label: `Mean edge weight, ${b}` };

  switch (kind) {
    case "subtracted":
      items.push(edgesA, edgesB);
      break;
    case "subtracted-points":
      items.push(edgesA, edgesB, pointsA, meanA, pointsB, meanB);
      break;
    case "subtracted-points-3d":
      items.push(edgesA, edgesB, pointsA, { ...pointsB, shape: "square" }, { ...meanA, shape: "diamond" }, meanB);
      break;
    case "points-ci":
      items.push(pointsA, meanA, pointsB, meanB, ...(showCI ? [ci] : []));
      break;
    case "points-ci-a":
      items.push(pointsA, meanA, ...(showCI ? [ci] : []));
      break;
    case "points-ci-b":
      items.push(pointsB, meanB, ...(showCI ? [ci] : []));
      break;
    case "mean-a":
      items.push(weightsA);
      break;
    case "mean-b":
      items.push(weightsB);
      break;
    case "points-a":
      items.push(weightsA, pointsA, meanA);
      break;
    case "points-b":
      items.push(weightsB, pointsB, meanB);
      break;
    case "individual-a":
      items.push({ shape: "line", color: colorA, label: `Edge weights, ${focusA ?? a}` }, { ...pointsA, label: `${focusA ?? a}` });
      break;
    case "individual-b":
      items.push({ shape: "line", color: colorB, label: `Edge weights, ${focusB ?? b}` }, { ...pointsB, label: `${focusB ?? b}` });
      break;
    case "subtracted-individual":
      items.push(
        { shape: "line", color: colorA, label: `+ Stronger in ${focusA ?? a}` },
        { shape: "line", color: colorB, label: `− Stronger in ${focusB ?? b}` },
        { ...pointsA, label: `${focusA ?? a}` },
        { ...pointsB, label: `${focusB ?? b}` },
      );
      break;
  }

  return (
    <ul className="pf-figure__legend" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label + item.shape}>
          <Swatch shape={item.shape} color={item.color} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
