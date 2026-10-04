// The landing page's showcase: one network, carried by the scroll from six
// separate ideas to connections, to pyENA's 2D space, into depth, to a written
// interpretation beside single connections, and on to the history that keeps it.
//
// It is RS.data run through native pyENA (src/content/demo.ts and depth.ts),
// never a made-up graph. Every node, edge and grid line is drawn through one
// camera: the 2D view is that camera looking straight at dimensions 1 and 2,
// and "See more" turns the same camera while the nodes rise to their places on
// dimension 3. The flat positions stay marked on the plane, so the 2D network
// is visibly the 3D one seen face-on.
//
// The scroll sets a continuous position t from 0 to 6 (one unit per chapter)
// and the drawing is a function of t, so scrolling back plays it backwards.
// Under reduced motion each chapter shows its finished state and nothing moves
// between them.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { DEMO, NODE_WEIGHT } from "../../content/demo";
import { DEPTH, DEPTH_PAIR, distances, idea, nodeOf } from "../../content/depth";
import { REPOSITORY_SAMPLES } from "../../data/samples";
import { num } from "../../results/format";
import { useArrival } from "../../ui/useArrival";
import { scrollToSection } from "../Site";

const A = DEMO.groups.a;
const B = DEMO.groups.b;
const CHAPTERS = 6;

// ---------------------------------------------------------------------------
// Easing and timing
// ---------------------------------------------------------------------------

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const v = clamp01(value);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
/** 0 before `from`, 1 after `to`, eased between. */
const span = (t: number, from: number, to: number) => ease((t - from) / (to - from));
const linear = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The two connections the page interprets
// ---------------------------------------------------------------------------

const edgeOf = (key: string) => DEMO.edges.find((edge) => `${edge.source}__${edge.target}` === key)!;
/** The connection that differs most between the groups, stronger for the second group. */
const DIFF_EDGE = edgeOf(DEMO.summary.networks.subtracted_mean_network_top_edges.group_b_stronger[0].edge);
const DIFF_EXCERPT = DEMO.excerpts.find((excerpt) => excerpt.group === B);
const PAIR_DIST = distances(DEPTH_PAIR.source, DEPTH_PAIR.target);

interface Note {
  edge: (typeof DEMO.edges)[number];
  tone: "a" | "b";
  text: string;
  /** The same, shortened for the phone's smaller margin. */
  short: string;
  quote?: string;
}

const NOTES: Note[] = [
  {
    edge: DIFF_EDGE,
    tone: "b",
    text:
      `${B}'s teams reason about the design in the same breath as they weigh ${idea(DIFF_EDGE.source).toLowerCase()}: ` +
      `the two come up within one stanza window more often than for ${A} (edge weight ${num(DIFF_EDGE.b)} against ${num(DIFF_EDGE.a)}). ` +
      `No other connection differs as much between the groups.`,
    short:
      `${B}'s teams reason about the design as they weigh ${idea(DIFF_EDGE.source).toLowerCase()}: ` +
      `edge weight ${num(DIFF_EDGE.b)}, against ${num(DIFF_EDGE.a)} for ${A}.`,
    quote: DIFF_EXCERPT?.text,
  },
  {
    edge: DEPTH_PAIR,
    tone: "a",
    text:
      `“${idea(DEPTH_PAIR.source)}” and “${idea(DEPTH_PAIR.target)}” sit ${num(PAIR_DIST.flat)} apart on the flat page, ` +
      `but ${num(PAIR_DIST.deep)} apart once dimension 3 is drawn: connections to one pull a speaker's point one way along it, ` +
      `connections to the other the opposite way. The two are seldom connected themselves (edge weight ${num(DEPTH_PAIR.overall)}).`,
    short:
      `${num(PAIR_DIST.flat)} apart flat, ${num(PAIR_DIST.deep)} apart in depth: each pulls a speaker's point the other way on dimension 3.`,
  },
];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

type Orientation = "wide" | "tall";

const VIEW: Record<Orientation, { w: number; h: number; font: number; chars: number }> = {
  wide: { w: 1000, h: 640, font: 15, chars: 20 },
  tall: { w: 520, h: 620, font: 20, chars: 12 },
};

/** A label on as many short lines as it needs, so it never runs off the drawing. */
function labelLines(text: string, chars: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Where each idea first appears: loose, before anything relates them (model units). */
const LOOSE: Record<string, [number, number]> = {
  Data: [-2.0, 1.05],
  "Technical.Constraints": [0.2, 1.7],
  "Performance.Parameters": [2.0, 0.95],
  "Client.and.Consultant.Requests": [-1.8, -1.3],
  "Design.Reasoning": [0.15, -0.55],
  Collaboration: [1.9, -1.55],
};

/** Edges in the order they draw: the passage's own connections first, then by weight. */
const EDGE_ORDER = (() => {
  const first = DEMO.connections.map((connection) => `${connection.source}__${connection.target}`);
  const rest = [...DEMO.edges].sort((x, y) => y.overall - x.overall).map((edge) => `${edge.source}__${edge.target}`);
  return [...new Set([...first, ...rest])];
})();
const MAX_EDGE = Math.max(...DEMO.edges.map((edge) => edge.overall));
const MAX_NODE = Math.max(...Object.values(NODE_WEIGHT));

interface Camera {
  yaw: number;
  pitch: number;
  depth: number;
  cx: number;
  cy: number;
  s: number;
}

const FOCAL = 11;
const YAW = -40 * DEG;
const PITCH = 17 * DEG;

function project(point: { x: number; y: number; z: number }, cam: Camera) {
  const z = point.z * cam.depth;
  const [cosY, sinY] = [Math.cos(cam.yaw), Math.sin(cam.yaw)];
  const x1 = point.x * cosY + z * sinY;
  const z1 = -point.x * sinY + z * cosY;
  const [cosP, sinP] = [Math.cos(cam.pitch), Math.sin(cam.pitch)];
  const y2 = point.y * cosP - z1 * sinP;
  const z2 = point.y * sinP + z1 * cosP;
  const k = FOCAL / (FOCAL - z2);
  return { x: cam.cx + cam.s * k * x1, y: cam.cy - cam.s * k * y2, k, z: z2 };
}

/** A scale that fits every node (and, flat, every loose start), at both ends of the turn, in the given half-extents. */
function fitScale(halfW: number, halfH: number, cams: Omit<Camera, "s" | "cx" | "cy">[]): number {
  let scale = Infinity;
  const loose = Object.values(LOOSE).map(([x, y]) => ({ x, y, z: 0 }));
  for (const cam of cams) {
    for (const node of [...DEPTH.nodes, ...(cam.depth === 0 ? loose : [])]) {
      const p = project(node, { ...cam, cx: 0, cy: 0, s: 1 });
      scale = Math.min(scale, halfW / Math.abs(p.x || 1e-9), halfH / Math.abs(p.y || 1e-9));
    }
  }
  return scale;
}

const FLAT_CAM = { yaw: 0, pitch: 0, depth: 0 };
const DEEP_CAM = { yaw: YAW, pitch: PITCH, depth: 1 };
const SCALE: Record<Orientation, { flat: number; deep: number }> = {
  wide: { flat: fitScale(390, 230, [FLAT_CAM]), deep: fitScale(225, 210, [FLAT_CAM, DEEP_CAM]) },
  tall: { flat: fitScale(180, 220, [FLAT_CAM]), deep: fitScale(170, 112, [FLAT_CAM, DEEP_CAM]) },
};

function cameraAt(t: number, orientation: Orientation, turn: number): Camera {
  const view = VIEW[orientation];
  const depth = span(t, 3.05, 3.75);
  // From "Interpret" on, the network makes room for the margin note.
  const margin = span(t, 3.85, 4.1);
  // Once there is depth, scrolling on keeps turning it a little, and a drag turns it more.
  const drift = (span(t, 4, 6) * 18 * DEG) * depth;
  const scale = SCALE[orientation];
  return {
    yaw: YAW * depth + drift + turn * depth,
    pitch: PITCH * depth,
    depth,
    cx: orientation === "wide" ? lerp(view.w / 2, 330, margin) : view.w / 2,
    cy: orientation === "wide" ? view.h / 2 + 8 : lerp(view.h / 2, 158, margin),
    s: lerp(scale.flat, scale.deep, Math.max(depth, margin)),
  };
}

/** A node's position in model space at t: loose, then pulled toward its place, then there. */
function placeAt(code: string, t: number) {
  const node = nodeOf(code);
  const [lx, ly] = LOOSE[code];
  const settle = Math.max(0.14 * span(t, 1.1, 2), span(t, 2.0, 2.7));
  return { x: lerp(lx, node.x, settle), y: lerp(ly, node.y, settle), z: node.z };
}

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

function Grid({ cam, opacity }: { cam: Camera; opacity: number }) {
  if (opacity <= 0.001) return null;
  const lines: ReactNode[] = [];
  const [min, max, step] = [-3, 3, 0.5];
  for (let v = min; v <= max + 1e-9; v += step) {
    const major = Math.abs(v - Math.round(v)) < 1e-9;
    const a = project({ x: v, y: min, z: 0 }, cam);
    const b = project({ x: v, y: max, z: 0 }, cam);
    const c = project({ x: min, y: v, z: 0 }, cam);
    const d = project({ x: max, y: v, z: 0 }, cam);
    lines.push(<line key={`x${v}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={major ? "is-major" : undefined} />);
    lines.push(<line key={`y${v}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} className={major ? "is-major" : undefined} />);
  }
  return (
    <g className="st-grid" opacity={opacity}>
      {lines}
    </g>
  );
}

function Axes({ cam, opacity, font }: { cam: Camera; opacity: number; font: number }) {
  if (opacity <= 0.001) return null;
  const o = project({ x: 0, y: 0, z: 0 }, cam);
  const ends = [
    { label: "Dimension 1", p: project({ x: 2.6, y: 0, z: 0 }, cam), show: 1 },
    { label: "Dimension 2", p: project({ x: 0, y: 2.45, z: 0 }, cam), show: 1 },
    { label: "Dimension 3", p: project({ x: 0, y: 0, z: 2.9 }, { ...cam, depth: 1 }), show: cam.depth },
  ];
  return (
    <g className="st-axes st-show__axes" opacity={opacity}>
      {ends.map(
        (end) =>
          end.show > 0.01 && (
            <g key={end.label} opacity={end.show}>
              <line x1={o.x} y1={o.y} x2={lerp(o.x, end.p.x, end.show)} y2={lerp(o.y, end.p.y, end.show)} />
              <text x={end.p.x + 6} y={end.p.y - 6} fontSize={font * 0.78} className="st-show__axis-label">
                {end.label}
              </text>
            </g>
          ),
      )}
    </g>
  );
}

interface StageProps {
  t: number;
  turn: number;
  orientation: Orientation;
}

/** Which note is open at t, and how far it has written itself. */
function noteAt(t: number): { index: number; generating: number; written: number; open: number } | null {
  if (t < 3.9 || t >= 5) return null;
  const index = t < 4.5 ? 0 : 1;
  const start = index === 0 ? 4.0 : 4.5;
  return {
    index,
    open: index === 0 ? span(t, 3.9, 4.05) : span(t, 4.5, 4.56),
    generating: linear(t, start, start + 0.1),
    written: linear(t, start + 0.1, start + 0.42),
  };
}

function ShowcaseStage({ t, turn, orientation }: StageProps) {
  const view = VIEW[orientation];
  const cam = cameraAt(t, orientation, turn);
  const note = noteAt(t);
  // In "See more", once the turn is under way, the pair depth separates most is the one to watch.
  const watchPair = !note && t >= 3.45 && t < 4;
  const focus = note
    ? `${NOTES[note.index].edge.source}__${NOTES[note.index].edge.target}`
    : watchPair
      ? `${DEPTH_PAIR.source}__${DEPTH_PAIR.target}`
      : null;
  const focusTone = note ? NOTES[note.index].tone : watchPair ? "a" : null;
  const networked = span(t, 2.0, 2.5);
  const gridOpacity = span(t, 2.2, 2.75);

  const placed = DEMO.codes.map((code, index) => {
    const model = placeAt(code, t);
    const screen = project(model, cam);
    const shown = span(t, 0.06 + index * 0.11, 0.24 + index * 0.11);
    const weight = NODE_WEIGHT[code] / MAX_NODE;
    const radius = lerp(8, 5 + 10 * weight, networked) * screen.k * lerp(0.4, 1, shown);
    return { code, model, screen, shown, radius };
  });
  const at = Object.fromEntries(placed.map((node) => [node.code, node]));
  // Farther nodes first, so nearer ones draw over them.
  const order = [...placed].sort((p, q) => p.screen.z - q.screen.z);

  const edges = EDGE_ORDER.map((key, index) => {
    const edge = edgeOf(key);
    const drawn = linear(t, 1.05 + index * 0.05, 1.25 + index * 0.05);
    const [p, q] = [at[edge.source].screen, at[edge.target].screen];
    const width = (1 + 6.5 * (edge.overall / MAX_EDGE)) * ((p.k + q.k) / 2);
    const isFocus = key === focus;
    const dim = focus && !isFocus ? (note ? 0.18 : 0.45) : 1;
    return { key, edge, drawn, p, q, width, isFocus, dim, depth: (p.z + q.z) / 2 };
  }).sort((x, y) => x.depth - y.depth);

  const focusEdge = edges.find((edge) => edge.isFocus);
  const leaderEnd = orientation === "wide" ? { x: 664, y: 150 } : { x: view.w / 2, y: 0.54 * view.h };
  const ghosts = cam.depth > 0.01 ? placed : [];

  return (
    <svg className="st-show__svg" viewBox={`0 0 ${view.w} ${view.h}`} role="img" aria-hidden="true">
      <Grid cam={cam} opacity={gridOpacity} />
      <Axes cam={cam} opacity={gridOpacity} font={view.font} />

      {/* The flat positions stay on the plane: the 2D network is this one seen face-on. */}
      {ghosts.map((node) => {
        const flat = project({ x: node.model.x, y: node.model.y, z: 0 }, cam);
        return (
          <g key={`ghost-${node.code}`} className="st-show__ghost" opacity={cam.depth * (focus ? 0.35 : 1)}>
            <line x1={flat.x} y1={flat.y} x2={node.screen.x} y2={node.screen.y} />
            <circle cx={flat.x} cy={flat.y} r={4} />
          </g>
        );
      })}

      {edges.map(
        (edge) =>
          edge.drawn > 0 && (
            <line
              key={edge.key}
              x1={edge.p.x}
              y1={edge.p.y}
              x2={lerp(edge.p.x, edge.q.x, edge.drawn)}
              y2={lerp(edge.p.y, edge.q.y, edge.drawn)}
              strokeWidth={edge.isFocus ? Math.max(edge.width, 4) + 1.5 : edge.width}
              opacity={edge.dim * (0.55 + 0.45 * networked)}
              className={`st-show__edge${
                edge.isFocus ? (focusTone === "b" ? " st-edge--b" : " st-edge--a") : networked > 0.5 ? " st-edge--net" : " st-edge--plain"
              }`}
            />
          ),
      )}

      {/* The margin note's leader: a hairline from the connection to its note. */}
      {focusEdge && note && (
        <line
          className="st-show__leader"
          x1={(focusEdge.p.x + focusEdge.q.x) / 2}
          y1={(focusEdge.p.y + focusEdge.q.y) / 2}
          x2={leaderEnd.x}
          y2={leaderEnd.y}
          opacity={note.open}
        />
      )}

      {order.map(
        (node) =>
          node.shown > 0.001 && (
            <g key={node.code} opacity={node.shown * (focus && !focus.split("__").includes(node.code) ? (note ? 0.4 : 0.7) : 1)}>
              <circle className="st-node" cx={node.screen.x} cy={node.screen.y} r={node.radius} />
              <text
                className="st-node__label st-show__label"
                x={node.screen.x}
                y={node.screen.y + node.radius + view.font + 2}
                fontSize={view.font}
                textAnchor="middle"
              >
                {labelLines(idea(node.code), view.chars).map((line, index) => (
                  <tspan key={line} x={node.screen.x} dy={index === 0 ? 0 : view.font * 1.15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          ),
      )}
    </svg>
  );
}

/** The margin beside the network: a connection's interpretation writing itself, then the history. */
function Margin({ t, orientation }: { t: number; orientation: Orientation }) {
  const note = noteAt(t);
  const history = span(t, 5.02, 5.3);
  if (note) {
    const content = NOTES[note.index];
    const text = orientation === "wide" ? content.text : content.short;
    const shown = Math.round(text.length * note.written);
    const writing = note.written > 0 && note.written < 1;
    return (
      <div className={`st-show__margin st-show__margin--${orientation}`} style={{ opacity: note.open }} aria-hidden="true">
        <p className="metadata pf-ink-secondary">Connection analysis / {note.index + 1} of 2</p>
        <p className={`st-show__pair st-show__pair--${content.tone}`}>
          <span className="label">{idea(content.edge.source)}</span>
          <span className="st-show__pair-line" />
          <span className="label">{idea(content.edge.target)}</span>
        </p>
        {/* As the platform's window does: the researcher asks, then the answer is written. */}
        <p className="st-show__ask small">Why are these connected?</p>
        <div className="st-show__generating" data-done={note.generating >= 1 || undefined}>
          <span className="small">{note.written >= 1 ? "Interpretation" : "Analysing connection…"}</span>
          <span className="st-show__progress">
            <span style={{ transform: `scaleX(${Math.max(note.generating * 0.3, note.written * 0.7 + 0.3 * note.generating)})` }} />
          </span>
        </div>
        {note.written > 0 && (
          <p className="small st-show__text">
            {text.slice(0, shown)}
            {writing && <span className="st-show__caret" />}
          </p>
        )}
        {content.quote && orientation === "wide" && note.written >= 1 && (
          <blockquote className="st-show__quote">
            <span className="st-show__ref">E1</span> “{content.quote}”
          </blockquote>
        )}
      </div>
    );
  }
  if (history <= 0.001) return null;
  const examples = REPOSITORY_SAMPLES.filter((sample) => sample.id !== "rs" && sample.id !== "rs-3d").slice(0, 2);
  return (
    <div className={`st-show__margin st-show__margin--${orientation}`} style={{ opacity: history }} aria-hidden="true">
      <p className="metadata pf-ink-secondary">History</p>
      <ol className="st-show__history">
        <li className="is-current">
          <span className="label">RS.data, design team talk</span>
          <span className="small pf-note">Saved just now / 2D and 3D / 2 interpretations</span>
        </li>
        {examples.map((sample) => (
          <li key={sample.id}>
            <span className="label">{sample.name}</span>
            <span className="small pf-note">Example / {sample.facts}</span>
          </li>
        ))}
      </ol>
      <p className="small pf-note">Open any of them again, as you left it.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The chapters
// ---------------------------------------------------------------------------

interface Chapter {
  number: string;
  name: string;
  title: string;
  body: ReactNode;
}

function chapters(): Chapter[] {
  const pair = [idea(DEPTH_PAIR.source), idea(DEPTH_PAIR.target)];
  return [
    {
      number: "01",
      name: "Ideas",
      title: "Six ideas, each on its own",
      body: (
        <p className="body">
          A design team's talk, coded for what it is about: RS.data, {DEMO.provenance.units} speakers across two game
          conditions. Before anything relates them, each code is an idea that came up.
        </p>
      ),
    },
    {
      number: "02",
      name: "Connect",
      title: "Ideas that come up together connect",
      body: (
        <p className="body">
          When two ideas come up within the same {DEMO.window} lines of talk, they connect. Across all{" "}
          {DEMO.provenance.rows.toLocaleString("en-US")} lines, every one of the {DEMO.edges.length} pairs does; the
          thicker the line, the more often.
        </p>
      ),
    },
    {
      number: "03",
      name: "Understand",
      title: "The network takes its shape in 2D",
      body: (
        <p className="body">
          pyENA places every idea in one shared space, so that each speaker sits at the centre of their own connections.
          Two dimensions, on graph paper: the network as a structure, not a tangle.
        </p>
      ),
    },
    {
      number: "04",
      name: "See more",
      title: "See more behind the connection",
      body: (
        <>
          <p className="body">
            Turn the same model and a third dimension opens. Nothing is redrawn: the flat network was this one seen
            face-on, and its positions stay marked on the plane.
          </p>
          <p className="body">
            “{pair[0]}” and “{pair[1]}” look almost on top of each other in 2D, {num(PAIR_DIST.flat)} apart. With
            depth they are {num(PAIR_DIST.deep)} apart.
          </p>
          <p className="small pf-note st-show__hint">Drag the network, or use the arrow keys on it, to turn it.</p>
        </>
      ),
    },
    {
      number: "05",
      name: "Interpret",
      title: "Each connection, explained",
      body: (
        <>
          <p className="body">
            Beside a connection, IdeaLens writes what it means: from the model's own numbers, with the talk behind it.
          </p>
          <div className="pf-visually-hidden">
            {NOTES.map((note) => (
              <p key={note.edge.source + note.edge.target}>
                “{idea(note.edge.source)}” and “{idea(note.edge.target)}”: {note.text}
                {note.quote ? ` “${note.quote}”` : ""}
              </p>
            ))}
          </div>
          <p className="small pf-note">A demonstration, written ahead of time from RS.data's model.</p>
        </>
      ),
    },
    {
      number: "06",
      name: "Explore",
      title: "Come back to it, and go further",
      body: (
        <>
          <p className="body">
            An analysis is never thrown away. Its data, codes, the 2D and 3D models and every interpretation are kept in
            your history, to reopen as you left them.
          </p>
          <div className="pf-row st-show__actions">
            <button type="button" className="ml-btn ml-btn--primary" onClick={() => scrollToSection("research")}>
              Bring your research
            </button>
            <button type="button" className="ml-btn ml-btn--ghost" onClick={() => scrollToSection("waitlist")}>
              Join the waitlist
            </button>
          </div>
        </>
      ),
    },
  ];
}

function useOrientation(): Orientation {
  const query = "(max-width: 899px)";
  const [tall, setTall] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setTall(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return tall ? "tall" : "wide";
}

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setReduce(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

export function Showcase() {
  const content = useMemo(chapters, []);
  const orientation = useOrientation();
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [turn, setTurn] = useState(0);
  const steps = useRef<(HTMLElement | null)[]>([]);
  const drag = useRef<{ x: number; turn: number } | null>(null);
  const titleId = useId();
  const headArrival = useArrival<HTMLDivElement>();

  // The reading line: the middle of the window, or just under the pinned drawing on a phone.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * (orientation === "tall" ? 0.66 : 0.5);
      let value = 0;
      steps.current.forEach((element, index) => {
        if (!element) return;
        const box = element.getBoundingClientRect();
        if (box.top <= line) value = index + clamp01((line - box.top) / box.height);
      });
      setProgress(Math.min(value, CHAPTERS - 0.001));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [orientation]);

  const chapter = Math.floor(progress);
  // Reduced motion: each chapter at its finished state, so nothing moves while scrolling.
  const t = reduce ? Math.min(chapter + 0.97, CHAPTERS - 0.01) : progress;
  const turnable = t >= 3.4;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // A finger scrolls the page; only a mouse or pen turns the model.
    if (!turnable || event.pointerType === "touch") return;
    drag.current = { x: event.clientX, turn };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setTurn(drag.current.turn + (event.clientX - drag.current.x) * 0.008);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!turnable || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    setTurn((value) => value + (event.key === "ArrowRight" ? 0.15 : -0.15));
  };

  return (
    <section className="st-section st-show" id="showcase" aria-labelledby={titleId}>
      <div className={`st-block st-show__head st-rise${headArrival.state}`} ref={headArrival.ref}>
        <p className="metadata pf-ink-secondary">How it works</p>
        <h2 className="st-h2" id={titleId}>
          Ideas, connections, depth, meaning
        </h2>
        <p className="body-lg st-lead">
          One real network, from one real dataset, carried by your scroll. Every position and line on it is pyENA's own
          result for RS.data.
        </p>
      </div>

      <div className="st-story st-show__story">
        <div className="st-story__stage st-show__stage">
          <div className="st-story__frame">
            <ol className="st-show__index" aria-label="Chapters">
              {content.map((step, index) => (
                <li key={step.number} aria-current={index === chapter ? "step" : undefined}>
                  <a
                    href={`#show-${step.number}`}
                    onClick={(event) => {
                      event.preventDefault();
                      steps.current[index]?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                    }}
                  >
                    <span className="metadata">{step.number}</span> <span className="small">{step.name}</span>
                  </a>
                </li>
              ))}
            </ol>
            <div
              className={`st-show__canvas st-show__canvas--${orientation}${turnable ? " is-turnable" : ""}`}
              tabIndex={0}
              role="group"
              aria-label={`The RS.data network, at chapter ${content[chapter].number}, ${content[chapter].name}.${
                turnable ? " Left and right arrow keys turn it." : ""
              }`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            >
              <ShowcaseStage t={t} turn={turn} orientation={orientation} />
              <Margin t={t} orientation={orientation} />
            </div>
            <p className="st-story__caption metadata pf-ink-secondary" aria-hidden="true">
              {content[chapter].number} / {content[chapter].name}
              {t >= 3 ? " / 3 dimensions" : t >= 2 ? " / 2 dimensions" : ""}
            </p>
          </div>
        </div>
        <ol className="st-story__steps">
          {content.map((step, index) => (
            <li
              key={step.number}
              id={`show-${step.number}`}
              ref={(element) => {
                steps.current[index] = element;
              }}
              className={`st-step st-show__step${index === chapter ? " is-active" : ""}`}
            >
              {/* On a phone this stays just under the pinned drawing while its chapter plays. */}
              <div className="st-show__step-inner">
                <p className="metadata pf-ink-secondary">
                  {step.number} / {step.name}
                </p>
                <h3 className="st-step__title">{step.title}</h3>
                <div className="st-step__body">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
