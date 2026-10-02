import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useStore } from "../../state/store";
import { CloseIcon } from "../../ui/marks";
import { FlagNote } from "../../ui/primitives";
import { ChartLoading, useDelayedFlag } from "../canvas/LoadingNetwork";

/**
 * plotly.js, the same release pyENA's own 3D pages embed (outputs_3d/*.html),
 * loaded the first time a 3D network is shown.
 */
const PLOTLY_JS = "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@4.1.1/plotly.min.js";

type PlotlyApi = {
  react(element: HTMLElement, data: unknown, layout: unknown, config: unknown): Promise<unknown>;
  relayout(element: HTMLElement, update: unknown): Promise<unknown>;
  restyle(element: HTMLElement, update: unknown, traces: number[]): Promise<unknown>;
  purge(element: HTMLElement): void;
};

/** plotly's graph div: its traces, and the events it emits. */
type PlotDiv = HTMLElement & {
  data?: { mode?: string; hovertemplate?: string; line?: { width?: number } }[];
  on?: (event: string, handler: (data: { points?: { data?: { hovertemplate?: string } }[] }) => void) => void;
  __edgeClicks?: boolean;
};

/** The two codes of one of pyENA's edge traces, from its hover text ("A ↔ B<br>Weight…"). */
export function edgeOfTrace(hovertemplate: string | undefined): [string, string] | null {
  const match = /^(.+?) ↔ (.+?)<br>/.exec(hovertemplate ?? "");
  return match ? [match[1], match[2]] : null;
}

/** What plotly keeps of a drawn 3D scene: enough to find where a point lands on screen. */
type DrawnScene = {
  _fullLayout?: {
    scene?: {
      _scene?: {
        dataScale?: number[];
        glplot?: { canvas?: HTMLCanvasElement; cameraParams?: { model: number[]; view: number[]; projection: number[] } };
      };
    };
  };
  data?: { hovertemplate?: string; line?: { width?: number }; x?: number[]; y?: number[]; z?: number[] }[];
};

/** A 4x4 column-major matrix times a vector, as plotly's own gl3d projection does it. */
function transform(matrix: number[], vector: number[]): number[] {
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) out[j] += matrix[4 * i + j] * vector[i];
  return out;
}

/**
 * Where on the screen the middle of the figure's strongest connection is drawn,
 * through the scene's current camera, so the tutorial can point at one line to
 * click (and follows it when the network is turned). Null until the scene is
 * drawn, or when that point is out of the picture.
 */
export function strongestEdgePoint(container: Element | null, skip: [string, string] | null = null): { x: number; y: number } | null {
  const plot = container?.querySelector(".js-plotly-plot") as (HTMLElement & DrawnScene) | null;
  const scene = plot?._fullLayout?.scene?._scene;
  const camera = scene?.glplot?.cameraParams;
  const canvas = scene?.glplot?.canvas;
  const scale = scene?.dataScale;
  if (!plot?.data || !camera || !canvas || !scale) return null;
  // `skip`: a connection already open, so the pointer shows a different one to click.
  const same = (codes: [string, string] | null) => !!codes && !!skip && ((codes[0] === skip[0] && codes[1] === skip[1]) || (codes[0] === skip[1] && codes[1] === skip[0]));
  const edges = plot.data.filter(
    (trace) => edgeOfTrace(trace.hovertemplate) && !same(edgeOfTrace(trace.hovertemplate)) && trace.x?.length === 2 && trace.y?.length === 2 && trace.z?.length === 2,
  );
  if (edges.length === 0) return null;
  const strongest = edges.reduce((best, trace) => ((trace.line?.width ?? 0) > (best.line?.width ?? 0) ? trace : best));
  const mid = [0, 1, 2].map((axis) => {
    const values = [strongest.x!, strongest.y!, strongest.z!][axis];
    return ((values[0] + values[1]) / 2) * scale[axis];
  });
  const p = transform(camera.projection, transform(camera.view, transform(camera.model, [...mid, 1])));
  if (!p[3]) return null;
  const box = canvas.getBoundingClientRect();
  const x = box.left + ((1 + p[0] / p[3]) / 2) * box.width;
  const y = box.top + ((1 - p[1] / p[3]) / 2) * box.height;
  const frame = plot.getBoundingClientRect();
  return x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom ? { x, y } : null;
}

/** Clicking an edge in 3D, and the edge kept highlighted while it is being interpreted. */
export interface EdgeInteraction {
  onEdgeClick?: (codes: [string, string]) => void;
  highlight?: [string, string] | null;
}

type Camera = Record<string, unknown>;

let loading: Promise<PlotlyApi> | null = null;
const PLOTLY_READY = "pyena:plotly-ready";

function loadPlotly(): Promise<PlotlyApi> {
  const existing = (window as unknown as { Plotly?: PlotlyApi }).Plotly;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise<PlotlyApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLOTLY_JS;
    script.async = true;
    script.onload = () => {
      resolve((window as unknown as { Plotly: PlotlyApi }).Plotly);
      // Every 3D plot waiting on a failed download recovers, not only the one retried.
      window.dispatchEvent(new Event(PLOTLY_READY));
    };
    script.onerror = () => {
      // Forget the failed attempt so Try again starts a fresh download.
      loading = null;
      script.remove();
      reject(new Error("The 3D viewer could not be downloaded. Check the connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** The camera plotly starts a 3D scene with; Reset view returns to it. */
const HOME_CAMERA = { eye: { x: 1.25, y: 1.25, z: 1.25 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };

/** Where the researcher has turned the scene to, so full screen opens on the same view. */
function currentCamera(element: HTMLElement | null): Camera | null {
  const layout = (element as unknown as { layout?: { scene?: { camera?: Camera } } } | null)?.layout;
  return layout?.scene?.camera ?? null;
}

/** A touch screen: there, a swipe over the page must scroll it. */
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * An interactive 3D network from pyENA's plot3d.py. On the page, the scroll
 * wheel and a swipe scroll on to the next result, never the model; drag
 * rotates and right-drag pans with a mouse. Zooming, and on a touch screen
 * any handling at all, belong to the full-screen view, where scrolling has
 * nothing else to do.
 */
export function Plot3D({ figureJson, label, onEdgeClick, highlight = null }: { figureJson: string; label: string } & EdgeInteraction) {
  const [full, setFull] = useState<{ camera: Camera | null } | null>(null);
  const inline = useRef<HTMLDivElement>(null);

  return (
    <>
      <Scene
        figureJson={figureJson}
        label={label}
        zoomable={false}
        sceneRef={inline}
        onEdgeClick={onEdgeClick}
        highlight={highlight}
        hint={
          COARSE
            ? "Open full screen to rotate and zoom. Scrolling here moves on down the page."
            : "Drag to rotate, right-drag to pan. The scroll wheel moves on down the page; open full screen to zoom."
        }
        actions={
          <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setFull({ camera: currentCamera(inline.current) })}>
            Full screen
          </button>
        }
      />
      {full && (
        <FullScreen
          figureJson={figureJson}
          label={label}
          camera={full.camera}
          onClose={() => setFull(null)}
          onEdgeClick={onEdgeClick}
          highlight={highlight}
        />
      )}
    </>
  );
}

function FullScreen({
  figureJson,
  label,
  camera,
  onClose,
  onEdgeClick,
  highlight,
}: {
  figureJson: string;
  label: string;
  camera: Camera | null;
  onClose: () => void;
} & EdgeInteraction) {
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // The page behind stays where it was.
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="pf-plot3d-full" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="pf-plot3d-full__head">
        <h2 className="pf-plot3d-full__title" id={titleId}>
          {label}
        </h2>
        <button ref={close} type="button" className="ml-btn ml-btn--secondary" onClick={onClose}>
          <CloseIcon size={18} />
          Close
        </button>
      </div>
      <Scene
        figureJson={figureJson}
        label={label}
        zoomable
        camera={camera}
        sceneRef={scene}
        onEdgeClick={onEdgeClick}
        highlight={highlight}
        fill
        hint="Drag to rotate. Scroll or pinch to zoom. Right-drag or two fingers to pan. Esc closes."
      />
    </div>
  );
}

function Scene({
  figureJson,
  label,
  zoomable,
  camera = null,
  sceneRef,
  hint,
  actions,
  fill = false,
  onEdgeClick,
  highlight = null,
}: {
  figureJson: string;
  label: string;
  zoomable: boolean;
  camera?: Camera | null;
  sceneRef: RefObject<HTMLDivElement | null>;
  hint: string;
  actions?: ReactNode;
  fill?: boolean;
} & EdgeInteraction) {
  const howId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const redrawing = useStore((store) => store.redrawing3d);
  const loaderShown = useDelayedFlag(state === "loading");
  const redrawShown = useDelayedFlag(redrawing && state === "ready");

  const askable = Boolean(onEdgeClick);
  useEffect(() => {
    let cancelled = false;
    const element = sceneRef.current;
    setState((current) => (current === "ready" ? current : "loading"));
    loadPlotly()
      .then((Plotly) => {
        if (cancelled || !element) return;
        const figure = JSON.parse(figureJson);
        const layout = { ...figure.layout, autosize: true };
        if (camera) layout.scene = { ...layout.scene, camera };
        // Where a line can be clicked, its hover label says so.
        const data = askable
          ? (figure.data as { hovertemplate?: string }[]).map((trace) =>
              edgeOfTrace(trace.hovertemplate)
                ? { ...trace, hovertemplate: trace.hovertemplate!.replace(/(<extra>|$)/, "<br><i>Click to ask about this connection</i>$1") }
                : trace,
            )
          : figure.data;
        return Plotly.react(element, data, layout, {
          responsive: true,
          displaylogo: false,
          // The wheel zooms only where the page cannot scroll: full screen.
          scrollZoom: zoomable,
          modeBarButtonsToRemove: ["resetCameraLastSave3d"],
        }).then(() => !cancelled && setState("ready"));
      })
      .catch((reason: Error) => {
        if (cancelled) return;
        setState("error");
        setError(reason.message);
      });
    return () => {
      cancelled = true;
      const Plotly = (window as unknown as { Plotly?: PlotlyApi }).Plotly;
      if (element && Plotly) Plotly.purge(element);
    };
    // The camera is only where the scene starts; later moves are the researcher's.
  }, [figureJson, attempt, zoomable, sceneRef, askable]);

  // plotly's camera cancels every wheel event over its canvas, zoom or no zoom,
  // so the page could not scroll past a model. On the page the wheel is stopped
  // here, before plotly sees it, and the browser scrolls as it would anywhere.
  useEffect(() => {
    const element = stage.current;
    if (zoomable || !element) return;
    const pass = (event: WheelEvent) => event.stopPropagation();
    element.addEventListener("wheel", pass, { capture: true, passive: true });
    return () => element.removeEventListener("wheel", pass, { capture: true });
  }, [zoomable]);

  useEffect(() => {
    if (state !== "error") return;
    const recover = () => {
      setError(null);
      setState("loading");
      setAttempt((count) => count + 1);
    };
    window.addEventListener(PLOTLY_READY, recover);
    return () => window.removeEventListener(PLOTLY_READY, recover);
  }, [state]);

  // A click on an edge (a drag rotates; only a click picks) names its two codes.
  const clickRef = useRef(onEdgeClick);
  clickRef.current = onEdgeClick;
  useEffect(() => {
    const element = sceneRef.current as PlotDiv | null;
    if (state !== "ready" || !element?.on || element.__edgeClicks) return;
    element.__edgeClicks = true;
    element.on("plotly_click", (event) => {
      const codes = edgeOfTrace(event.points?.[0]?.data?.hovertemplate);
      if (codes) clickRef.current?.(codes);
    });
  }, [state, sceneRef]);

  // The edge being interpreted stands out: wider, and the other edges recede.
  useEffect(() => {
    const element = sceneRef.current as PlotDiv | null;
    const Plotly = (window as unknown as { Plotly?: PlotlyApi }).Plotly;
    if (state !== "ready" || !element?.data || !Plotly) return;
    const original = (JSON.parse(figureJson).data ?? []) as NonNullable<PlotDiv["data"]>;
    const traces: number[] = [];
    const widths: number[] = [];
    const opacities: number[] = [];
    original.forEach((trace, index) => {
      const codes = edgeOfTrace(trace.hovertemplate);
      if (!codes) return;
      const on = highlight !== null && ((codes[0] === highlight[0] && codes[1] === highlight[1]) || (codes[0] === highlight[1] && codes[1] === highlight[0]));
      const width = trace.line?.width ?? 2;
      traces.push(index);
      widths.push(on ? width * 2 + 4 : width);
      opacities.push(highlight === null || on ? 1 : 0.3);
    });
    if (traces.length > 0) void Plotly.restyle(element, { "line.width": widths, opacity: opacities }, traces);
  }, [highlight?.[0], highlight?.[1], state, figureJson, sceneRef]);

  const resetView = () => {
    const Plotly = (window as unknown as { Plotly?: PlotlyApi }).Plotly;
    if (sceneRef.current && Plotly) void Plotly.relayout(sceneRef.current, { "scene.camera": HOME_CAMERA });
  };

  return (
    <div className={`pf-plot3d${fill ? " pf-plot3d--fill" : ""}`}>
      <div className="pf-plot3d__bar">
        <p className="small pf-note" id={howId}>
          {hint}
        </p>
        <span className="pf-row pf-row--tight">
          <button type="button" className="ml-btn ml-btn--ghost" onClick={resetView} disabled={state !== "ready"}>
            Reset view
          </button>
          {actions}
        </span>
      </div>
      {/* pyENA's plotly figure carries paper colours, so it sits on paper in either theme. */}
      <div ref={stage} className={`pf-plot3d__stage${!zoomable && COARSE ? " is-passive" : ""}`} data-theme="paper">
        <div
          ref={sceneRef}
          className="pf-plot3d__canvas"
          role="group"
          aria-roledescription="interactive 3D plot"
          aria-label={label}
          aria-describedby={howId}
          aria-busy={state === "loading" || redrawing}
        />
        {loaderShown && (
          <ChartLoading
            caption="Loading the 3D viewer…"
            slowCaption="The 3D viewer downloads once (about 5 MB) and is taking longer than usual. It will appear when the download finishes."
          />
        )}
        {redrawShown && <ChartLoading over caption="Redrawing…" />}
        {state === "error" && (
          <div className="pf-chart-failed" role="alert">
            <FlagNote>{error}</FlagNote>
            <button
              type="button"
              className="ml-btn ml-btn--secondary"
              onClick={() => {
                setError(null);
                setState("loading");
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
