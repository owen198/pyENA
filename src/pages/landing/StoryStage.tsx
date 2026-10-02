// The landing page's one drawing: RS.data's research moving through pyENA,
// from six lines of talk to the analysis. It is a single SVG whose elements
// move between states, never a sequence of separate pictures: the codes that
// leave the document are the nodes of the network, the network is the space
// the points are projected into, and the analysis recolours that same network.
//
// Everything placed in the ENA space is drawn through one camera, as is the
// graph paper, so zooming moves the grid and the data together and no point
// ever floats off its lines (the fix the figures got in bridge.py).

import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO, edgeKey, GROUP_MEANS, NODE_WEIGHT } from "../../content/demo";

export const STAGES = [
  "source",
  "extract",
  "connect",
  "bloom",
  "clusters",
  "analyze",
  "themes",
  "relationships",
  "evidence",
  "charts",
  "findings",
] as const;
export type StageId = (typeof STAGES)[number];

type Orientation = "wide" | "tall";
type Values = Record<string, number>;

const VIEW: Record<Orientation, { w: number; h: number; font: number; line: number; meta: number }> = {
  wide: { w: 1000, h: 680, font: 15, line: 21, meta: 11 },
  tall: { w: 600, h: 660, font: 19, line: 26, meta: 15 },
};

const A = DEMO.groups.a;
const TOP_A = DEMO.summary.networks.subtracted_mean_network_top_edges.group_a_stronger[0]?.edge;
const TOP_B = DEMO.summary.networks.subtracted_mean_network_top_edges.group_b_stronger[0]?.edge;
const MAX_NODE_WEIGHT = Math.max(...Object.values(NODE_WEIGHT));

// ---------------------------------------------------------------------------
// Text: wrapped with the real font's measurements, so SVG text never overruns.
// ---------------------------------------------------------------------------

let measurer: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, weight = 400): number {
  if (typeof document === "undefined") return text.length * size * 0.52;
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * size * 0.52;
  measurer.font = `${weight} ${size}px Figtree, sans-serif`;
  return measurer.measureText(text).width;
}

function wrap(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next, size) <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(text: string, width: number, size: number): string {
  if (measure(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Geometry for each state
// ---------------------------------------------------------------------------

interface Camera {
  cx: number;
  cy: number;
  s: number;
}

function fit(xs: number[], ys: number[], area: { x0: number; x1: number; y0: number; y1: number }, pad: number): Camera {
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = (maxX - minX) * (1 + pad);
  const spanY = (maxY - minY) * (1 + pad);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    s: Math.min((area.x1 - area.x0) / spanX, (area.y1 - area.y0) / spanY),
  };
}

interface DocLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: { y: number; text: string[]; speaker: string; tagsY: number; tags: { code: string; x: number; w: number }[] }[];
}

function layoutDocument(orientation: Orientation): DocLayout {
  const view = VIEW[orientation];
  const wide = orientation === "wide";
  const x = wide ? 28 : 24;
  const w = wide ? 410 : 552;
  const inner = w - 40;
  const tagSize = view.meta;
  let y = (wide ? 36 : 20) + 24;
  const lines = DEMO.document.lines.map((line) => {
    // On a phone each line is one row: its words, then its codes in their place.
    const text = wide ? wrap(line.text, inner, view.font) : [truncate(line.text, inner, view.font)];
    const top = y;
    const tagsY = wide ? top + view.meta + 8 + text.length * view.line + 4 : top + view.meta + 12;
    let tagX = x + 20;
    const tags = line.codes.map((code) => {
      const tagW = measure(code, tagSize, 500) + 14;
      const tag = { code, x: tagX, w: tagW };
      tagX += tagW + 6;
      return tag;
    });
    y = wide ? tagsY + tagSize + 26 : top + view.meta + 8 + view.line + 12;
    return { y: top, text, speaker: line.speaker, tagsY, tags };
  });
  return { x, y: wide ? 36 : 20, w, h: y - (wide ? 36 : 20), lines };
}

interface Geometry {
  orientation: Orientation;
  doc: DocLayout;
  arc: Record<string, { x: number; y: number }>;
  origin: Record<string, { x: number; y: number }>;
  network: Camera;
  clusters: Camera;
}

function geometry(orientation: Orientation): Geometry {
  const view = VIEW[orientation];
  const wide = orientation === "wide";
  const doc = layoutDocument(orientation);

  // Where each code first appears: the tag on its first line.
  const origin: Geometry["origin"] = {};
  doc.lines.forEach((line) =>
    line.tags.forEach((tag) => {
      origin[tag.code] ??= { x: tag.x + tag.w / 2, y: line.tagsY + view.meta / 2 };
    }),
  );
  // Extracted codes, before they are placed in the space: a ring beside the document.
  const below = doc.y + doc.h;
  const ring = wide ? { x: 740, y: 330, r: 185 } : { x: 300, y: below + (view.h - below) / 2, r: Math.min(96, (view.h - below) / 2 - 22) };
  const arc: Geometry["arc"] = {};
  DEMO.codes.forEach((code, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / DEMO.codes.length;
    arc[code] = { x: ring.x + ring.r * Math.cos(angle), y: ring.y + ring.r * Math.sin(angle) };
  });

  const area = wide ? { x0: 170, x1: 830, y0: 60, y1: view.h - 60 } : { x0: 110, x1: 490, y0: 70, y1: view.h - 70 };
  const network = fit(
    DEMO.nodes.map((node) => node.x),
    DEMO.nodes.map((node) => node.y),
    area,
    0.08,
  );
  const clusters = fit(
    DEMO.units.map((unit) => unit.x),
    DEMO.units.map((unit) => unit.y),
    wide ? { x0: 120, x1: 880, y0: 50, y1: view.h - 70 } : { x0: 60, x1: 540, y0: 60, y1: view.h - 80 },
    0.25,
  );
  return { orientation, doc, arc, origin, network, clusters };
}

const SUBTRACTED_STAGES = new Set<StageId>(["analyze", "relationships", "evidence", "findings"]);
const CLOSE_STAGES = new Set<StageId>(["clusters", "charts"]);

/** Every number the drawing needs in one state; the tween moves between two of these. */
function target(stage: StageId, geo: Geometry): Values {
  const index = STAGES.indexOf(stage);
  const inSpace = index >= STAGES.indexOf("bloom");
  const camera = CLOSE_STAGES.has(stage) ? geo.clusters : geo.network;
  const values: Values = {
    "cam.cx": camera.cx,
    "cam.cy": camera.cy,
    "cam.ls": Math.log(camera.s),
    "doc.o": index <= STAGES.indexOf("connect") ? 1 : 0,
    "doc.dx": index <= STAGES.indexOf("connect") ? 0 : -60,
    "tags.o": index >= 1 && index <= STAGES.indexOf("connect") ? 1 : 0,
    "grid.o": inSpace ? 1 : 0,
    "axes.o": inSpace ? 1 : 0,
    "ticks.o": CLOSE_STAGES.has(stage) ? 1 : 0,
    "poles.o": stage === "themes" ? 1 : 0,
    "means.o": ["clusters", "analyze", "charts", "findings"].includes(stage) ? 1 : 0,
    "ci.o": CLOSE_STAGES.has(stage) ? 1 : 0,
    "meanLabels.o": ["analyze", "findings", "charts", "clusters"].includes(stage) ? 1 : 0,
  };

  for (const code of DEMO.codes) {
    const arc = geo.arc[code];
    const origin = geo.origin[code] ?? arc;
    const before = stage === "source";
    values[`n.${code}.sx`] = before ? origin.x : arc.x;
    values[`n.${code}.sy`] = before ? origin.y : arc.y;
    values[`n.${code}.k`] = inSpace ? 1 : 0;
    values[`n.${code}.o`] = before ? 0 : CLOSE_STAGES.has(stage) ? 0.35 : 1;
    const weighted = 5 + 9 * (NODE_WEIGHT[code] / MAX_NODE_WEIGHT);
    values[`n.${code}.r`] = before ? 2 : stage === "themes" ? weighted + 3 : inSpace ? weighted : 8;
    values[`n.${code}.lo`] = before || CLOSE_STAGES.has(stage) ? 0 : 1;
  }

  for (const edge of DEMO.edges) {
    const key = edgeKey(edge);
    const subtracted = SUBTRACTED_STAGES.has(stage);
    let width = 1.5;
    let opacity = index >= STAGES.indexOf("connect") ? 1 : 0;
    if (inSpace) width = subtracted ? 1 + 45 * Math.abs(edge.subtracted) : 1 + 12 * edge.overall;
    if (CLOSE_STAGES.has(stage)) opacity = 0.14;
    if (stage === "themes") opacity = 0.22;
    if (stage === "evidence" && key !== TOP_A && key !== TOP_B) opacity = 0.14;
    values[`e.${key}.w`] = width;
    values[`e.${key}.o`] = opacity;
  }

  const spread = ["clusters", "analyze", "charts", "findings"].includes(stage) ? 1 : 0;
  values["p.spread"] = spread;
  values["p.o"] = CLOSE_STAGES.has(stage) ? 0.85 : ["analyze", "findings"].includes(stage) ? 0.45 : 0;
  values["p.r"] = CLOSE_STAGES.has(stage) ? 6 : 3;
  return values;
}

// ---------------------------------------------------------------------------
// The tween: every value eases from where it is to where the state puts it.
// ---------------------------------------------------------------------------

const DURATION = 650;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function useTween(goal: Values, reduced: boolean): Values {
  const [values, setValues] = useState(goal);
  const current = useRef(goal);
  useEffect(() => {
    const from = { ...current.current };
    const keys = Object.keys(goal);
    if (reduced) {
      current.current = goal;
      setValues(goal);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const k = ease(t);
      const next: Values = {};
      for (const key of keys) {
        const a = from[key] ?? goal[key];
        next[key] = a + (goal[key] - a) * k;
      }
      current.current = next;
      setValues(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [goal, reduced]);
  return values;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function gridLines(camera: Camera, view: { w: number; h: number }, step: number) {
  const toX = (x: number) => view.w / 2 + (x - camera.cx) * camera.s;
  const toY = (y: number) => view.h / 2 - (y - camera.cy) * camera.s;
  const x0 = camera.cx - view.w / 2 / camera.s;
  const x1 = camera.cx + view.w / 2 / camera.s;
  const y0 = camera.cy - view.h / 2 / camera.s;
  const y1 = camera.cy + view.h / 2 / camera.s;
  const xs: { at: number; value: number }[] = [];
  const ys: { at: number; value: number }[] = [];
  for (let value = Math.ceil(x0 / step) * step; value <= x1; value += step) xs.push({ at: toX(value), value });
  for (let value = Math.ceil(y0 / step) * step; value <= y1; value += step) ys.push({ at: toY(value), value });
  return { xs, ys };
}

/** A code name broken at its dots into rows of at most 16 characters, so long names stay in the frame. */
function labelRows(code: string): string[] {
  if (code.length <= 16) return [code];
  const rows: string[] = [];
  let current = "";
  for (const part of code.split(/(?<=\.)/)) {
    if (current && (current + part).length > 16) {
      rows.push(current);
      current = part;
    } else current += part;
  }
  if (current) rows.push(current);
  return rows;
}

/** The x of the ring's centre, so ring labels point outwards. */
function ringCentre(geo: Geometry): number {
  const xs = Object.values(geo.arc).map((point) => point.x);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function StoryStage({ stage, label }: { stage: StageId; label: string }) {
  const [orientation, setOrientation] = useState<Orientation>(() =>
    window.matchMedia("(max-width: 899px)").matches ? "tall" : "wide",
  );
  const [fontsReady, setFontsReady] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const change = () => setOrientation(media.matches ? "tall" : "wide");
    media.addEventListener("change", change);
    void document.fonts?.ready.then(() => setFontsReady(true));
    return () => media.removeEventListener("change", change);
  }, []);

  // Text is measured once the real font has loaded.
  const geo = useMemo(() => geometry(orientation), [orientation, fontsReady]);
  const goal = useMemo(() => target(stage, geo), [stage, geo]);
  const v = useTween(goal, reduced);
  const view = VIEW[orientation];
  const camera: Camera = { cx: v["cam.cx"], cy: v["cam.cy"], s: Math.exp(v["cam.ls"]) };
  const project = (x: number, y: number) => ({
    x: view.w / 2 + (x - camera.cx) * camera.s,
    y: view.h / 2 - (y - camera.cy) * camera.s,
  });

  // Nodes: on the ring or at the tag they came from, or in the space.
  const nodes = Object.fromEntries(
    DEMO.nodes.map((node) => {
      const k = v[`n.${node.code}.k`];
      const world = project(node.x, node.y);
      return [
        node.code,
        {
          x: v[`n.${node.code}.sx`] + (world.x - v[`n.${node.code}.sx`]) * k,
          y: v[`n.${node.code}.sy`] + (world.y - v[`n.${node.code}.sy`]) * k,
          r: v[`n.${node.code}.r`],
          o: v[`n.${node.code}.o`],
          lo: v[`n.${node.code}.lo`],
        },
      ];
    }),
  );

  const index = STAGES.indexOf(stage);
  const connecting = stage === "connect";
  const subtracted = SUBTRACTED_STAGES.has(stage);
  const inSpace = index >= STAGES.indexOf("bloom");
  const coarse = clamp((600 - camera.s) / 300);
  const fine = clamp((camera.s - 450) / 300);
  const gridCoarse = coarse > 0.01 ? gridLines(camera, view, 0.125) : null;
  const gridFine = fine > 0.01 ? gridLines(camera, view, 0.025) : null;
  const ticks = v["ticks.o"] > 0.01 ? gridLines(camera, view, 0.1) : null;
  const origin = project(0, 0);
  const meanA = project(GROUP_MEANS.a[0], GROUP_MEANS.a[1]);
  const meanB = project(GROUP_MEANS.b[0], GROUP_MEANS.b[1]);
  const pointsA = DEMO.summary.points.group_a.confidence_interval_95;
  const pointsB = DEMO.summary.points.group_b.confidence_interval_95;
  const ciRect = (ci: typeof pointsA) => {
    const low = project(ci.dimension_1[0], ci.dimension_2[0]);
    const high = project(ci.dimension_1[1], ci.dimension_2[1]);
    return { x: low.x, y: high.y, width: high.x - low.x, height: low.y - high.y };
  };
  const poles = DEMO.summary.axis_interpretation.dimension_1;
  const labelSize = orientation === "wide" ? 13 : 17;

  return (
    <svg
      className={`st-stage st-stage--${stage}${reduced ? " is-still" : ""}`}
      viewBox={`0 0 ${view.w} ${view.h}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Graph paper, in the space's own coordinates. */}
      <g className="st-grid" opacity={round(v["grid.o"])}>
        {gridCoarse && (
          <g opacity={round(coarse)}>
            {gridCoarse.xs.map((line) => (
              <line key={`x${line.value.toFixed(4)}`} x1={line.at} x2={line.at} y1={0} y2={view.h} className={Math.abs(line.value / 0.5 - Math.round(line.value / 0.5)) < 1e-6 ? "is-major" : undefined} />
            ))}
            {gridCoarse.ys.map((line) => (
              <line key={`y${line.value.toFixed(4)}`} y1={line.at} y2={line.at} x1={0} x2={view.w} className={Math.abs(line.value / 0.5 - Math.round(line.value / 0.5)) < 1e-6 ? "is-major" : undefined} />
            ))}
          </g>
        )}
        {gridFine && (
          <g opacity={round(fine)}>
            {gridFine.xs.map((line) => (
              <line key={`fx${line.value.toFixed(4)}`} x1={line.at} x2={line.at} y1={0} y2={view.h} className={Math.abs(line.value / 0.1 - Math.round(line.value / 0.1)) < 1e-6 ? "is-major" : undefined} />
            ))}
            {gridFine.ys.map((line) => (
              <line key={`fy${line.value.toFixed(4)}`} y1={line.at} y2={line.at} x1={0} x2={view.w} className={Math.abs(line.value / 0.1 - Math.round(line.value / 0.1)) < 1e-6 ? "is-major" : undefined} />
            ))}
          </g>
        )}
        <g className="st-axes" opacity={round(v["axes.o"])}>
          <line x1={0} x2={view.w} y1={origin.y} y2={origin.y} />
          <line y1={0} y2={view.h} x1={origin.x} x2={origin.x} />
        </g>
        {ticks && (
          <g className="st-ticks" opacity={round(v["ticks.o"])} fontSize={labelSize - 2}>
            {ticks.xs
              .filter((tick) => tick.at > 30 && tick.at < view.w - 30)
              .map((tick) => (
                <text key={`tx${tick.value.toFixed(2)}`} x={tick.at} y={view.h - 12} textAnchor="middle">
                  {tick.value.toFixed(1).replace("-", "−")}
                </text>
              ))}
            {ticks.ys
              .filter((tick) => tick.at > 20 && tick.at < view.h - 36)
              .map((tick) => (
                <text key={`ty${tick.value.toFixed(2)}`} x={10} y={tick.at + 4}>
                  {tick.value.toFixed(1).replace("-", "−")}
                </text>
              ))}
          </g>
        )}
      </g>

      {/* The research: six lines, then the codes marked on each. */}
      <g className="st-doc" opacity={round(v["doc.o"])} transform={`translate(${round(v["doc.dx"])} 0)`}>
        <rect className="st-doc__sheet" x={geo.doc.x} y={geo.doc.y} width={geo.doc.w} height={geo.doc.h} rx={8} />
        {geo.doc.lines.map((line, lineIndex) => (
          <g key={lineIndex} className={`st-doc__line${connecting ? " is-connecting" : ""}`} style={{ ["--i" as string]: lineIndex }}>
            <rect className="st-doc__mark" x={geo.doc.x + 8} y={line.y - 6} width={geo.doc.w - 16} height={line.tagsY - line.y + view.meta + 12} rx={4} />
            <text className="st-doc__speaker" x={geo.doc.x + 20} y={line.y + view.meta} fontSize={view.meta}>
              {line.speaker.toUpperCase()}
            </text>
            <g opacity={orientation === "tall" ? round(1 - v["tags.o"]) : 1}>
              {line.text.map((text, row) => (
                <text key={row} className="st-doc__text" x={geo.doc.x + 20} y={line.y + view.meta + 8 + (row + 1) * view.line - 5} fontSize={view.font}>
                  {text}
                </text>
              ))}
            </g>
            <g className="st-doc__tags" opacity={round(v["tags.o"])}>
              {line.tags.map((tag) => (
                <g key={tag.code}>
                  <rect x={tag.x} y={line.tagsY - 2} width={tag.w} height={view.meta + 8} rx={3} />
                  <text x={tag.x + 7} y={line.tagsY + view.meta - 1} fontSize={view.meta}>
                    {tag.code}
                  </text>
                </g>
              ))}
            </g>
          </g>
        ))}
      </g>

      {/* Connections: drawn line by line as the stanza window forms them, then weighted. */}
      <g className="st-edges">
        {DEMO.edges.map((edge) => {
          const key = edgeKey(edge);
          const from = nodes[edge.source];
          const to = nodes[edge.target];
          const line = DEMO.connections.find((connection) => edgeKey(connection) === key)?.line ?? 0;
          const order = DEMO.connections.findIndex((connection) => edgeKey(connection) === key);
          const tone = subtracted ? (edge.subtracted > 0 ? "a" : "b") : inSpace ? "net" : "plain";
          return (
            <path
              key={key}
              className={`st-edge st-edge--${tone}`}
              d={`M${round(from.x)} ${round(from.y)} L${round(to.x)} ${round(to.y)}`}
              pathLength={1}
              strokeWidth={round(v[`e.${key}.w`])}
              opacity={round(v[`e.${key}.o`])}
              style={{
                strokeDashoffset: index >= STAGES.indexOf("connect") ? 0 : 1,
                transitionDelay: connecting && !reduced ? `${line * 420 + (order % 5) * 60}ms` : "0ms",
              }}
            />
          );
        })}
      </g>

      {/* Units: each speaker's point, spreading out from the centre of the space. */}
      <g className="st-points" opacity={round(v["p.o"])}>
        {DEMO.units.map((unit) => {
          const at = project(unit.x * v["p.spread"], unit.y * v["p.spread"]);
          const r = v["p.r"];
          return unit.group === A ? (
            <circle key={unit.label} className="st-point st-point--a" cx={round(at.x)} cy={round(at.y)} r={round(r)} />
          ) : (
            <path
              key={unit.label}
              className="st-point st-point--b"
              d={`M${round(at.x)} ${round(at.y - r * 1.15)} L${round(at.x + r)} ${round(at.y + r * 0.7)} L${round(at.x - r)} ${round(at.y + r * 0.7)} Z`}
            />
          );
        })}
      </g>

      {/* Group means and their 95% confidence intervals. */}
      <g className="st-means" opacity={round(v["means.o"])}>
        <g opacity={round(v["ci.o"])}>
          <rect className="st-ci st-ci--a" {...ciRect(pointsA)} />
          <rect className="st-ci st-ci--b" {...ciRect(pointsB)} />
        </g>
        <rect className="st-mean st-mean--a" x={meanA.x - 6} y={meanA.y - 6} width={12} height={12} />
        <path className="st-mean st-mean--b" d={`M${meanB.x} ${meanB.y - 8} L${meanB.x + 8} ${meanB.y} L${meanB.x} ${meanB.y + 8} L${meanB.x - 8} ${meanB.y} Z`} />
        <g className="st-meanlabels" opacity={round(v["meanLabels.o"])} fontSize={labelSize}>
          <text x={meanA.x - 12} y={meanA.y - 14} textAnchor="end">
            {DEMO.groups.a} mean
          </text>
          <text x={meanB.x + 12} y={meanB.y - 14}>
            {DEMO.groups.b} mean
          </text>
        </g>
      </g>

      {/* Codes. */}
      <g className="st-nodes">
        {DEMO.codes.map((code) => {
          const node = nodes[code];
          const right = node.x >= (inSpace ? view.w / 2 : ringCentre(geo));
          const rows = labelRows(code);
          const x = round(node.x + (right ? node.r + 6 : -node.r - 6));
          const top = node.y + 4 - ((rows.length - 1) * (labelSize + 2)) / 2;
          return (
            <g key={code} opacity={round(node.o)}>
              <circle className="st-node" cx={round(node.x)} cy={round(node.y)} r={round(node.r)} />
              <text className="st-node__label" x={x} y={round(top)} textAnchor={right ? "start" : "end"} fontSize={labelSize} opacity={round(node.lo)}>
                {rows.map((row, rowIndex) => (
                  <tspan key={row} x={x} dy={rowIndex === 0 ? 0 : labelSize + 2}>
                    {row}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </g>

      {/* What dimension 1 separates, by node position (pyENA's heuristic). */}
      {poles && (
        <g className="st-poles" opacity={round(v["poles.o"])} fontSize={labelSize}>
          <text x={16} y={origin.y + 28}>
            ← {poles.negative_pole_codes.slice(0, 2).map((pole) => pole.code).join(", ")}
          </text>
          <text x={view.w - 16} y={origin.y + 28} textAnchor="end">
            {poles.positive_pole_codes.slice(0, 2).map((pole) => pole.code).join(", ")} →
          </text>
        </g>
      )}
    </svg>
  );
}
