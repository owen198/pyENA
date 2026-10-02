// The first-time tutorial, drawn over the real workspace: a spotlight on the
// control the step is about, the instruction panel beside it, and the start,
// paused and finished cards. Nothing here is a copy of the platform: the
// researcher presses the workspace's own buttons, and the steps move on when
// the workspace's own state says the action happened (src/tutorial/steps.tsx).
// The rest of the page stays usable under the dimming, so the tutorial never
// locks anyone in.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { navigate, useLocation } from "../router";
import { useBound } from "../state/persist";
import { useStore } from "../state/store";
import { pad } from "../steps";
import { PointerArrow } from "../ui/marks";
import { FlagNote, Modal } from "../ui/primitives";
import { useTour } from "./state";
import { PROGRESS_STEPS, STEPS } from "./steps";

const GAP = 14;
const MARGIN = 16;
const PAD = 6;

export type Side = "top" | "bottom" | "left" | "right" | "none";

interface Placement {
  top: number;
  left: number;
  side: Side;
  /** Where the caret sits along the panel's edge, in px. */
  caret: number;
}

const overlaps = (top: number, left: number, width: number, height: number, boxes: DOMRect[]) =>
  boxes.some((box) => left < box.right && left + width > box.left && top < box.bottom && top + height > box.top);

/**
 * The panel beside the target: below or above a small control, beside a large
 * one, inside when nothing fits. It never lands on `avoid` (the connection
 * panel, while the target is elsewhere), so the tutorial and the panel are
 * never stacked on each other.
 */
function place(target: DOMRect | null, width: number, height: number, prefer?: Side[], avoid: DOMRect | null = null, spot: Point | null = null): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (!target) {
    const left = avoid ? clamp(avoid.left - width - MARGIN, MARGIN, vw - width - MARGIN) : vw - width - MARGIN;
    return { top: vh - height - MARGIN, left, side: "none", caret: 0 };
  }
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const small = target.width < 420 && target.height < 200;
  const options: Side[] = prefer ?? (small ? ["bottom", "top", "right", "left"] : ["right", "left", "bottom", "top"]);
  // Keep off the connection panel and off the place to click (with room for the pointer beside it).
  const blocked = [avoid, spot ? new DOMRect(spot.x - 36, spot.y - 36, 84, 84) : null].filter((box): box is DOMRect => box !== null);
  const free = (top: number, left: number) => !overlaps(top, left, width, height, blocked);
  // Along the panel's edge, keep clear of `avoid` when there is room to.
  const across = (centre: number) => {
    const left = clamp(centre - width / 2, MARGIN, vw - width - MARGIN);
    return avoid && left + width > avoid.left && avoid.left - width - MARGIN >= MARGIN ? Math.min(left, avoid.left - width - MARGIN) : left;
  };
  for (const side of options) {
    if (side === "bottom" && target.bottom + GAP + height <= vh - MARGIN) {
      const left = across(cx);
      if (free(target.bottom + GAP, left)) return { top: target.bottom + GAP, left, side, caret: clamp(cx - left, 20, width - 20) };
    }
    if (side === "top" && target.top - GAP - height >= MARGIN) {
      const left = across(cx);
      if (free(target.top - GAP - height, left)) return { top: target.top - GAP - height, left, side, caret: clamp(cx - left, 20, width - 20) };
    }
    if (side === "right" && target.right + GAP + width <= vw - MARGIN) {
      const top = clamp(cy - height / 2, MARGIN, vh - height - MARGIN);
      if (free(top, target.right + GAP)) return { top, left: target.right + GAP, side, caret: clamp(cy - top, 20, height - 20) };
    }
    if (side === "left" && target.left - GAP - width >= MARGIN) {
      const top = clamp(cy - height / 2, MARGIN, vh - height - MARGIN);
      if (free(top, target.left - GAP - width)) return { top, left: target.left - GAP - width, side, caret: clamp(cy - top, 20, height - 20) };
    }
  }
  // A target as big as the screen: the panel sits in one of its corners, the first that keeps
  // clear of `avoid` and of the place to click.
  const right = avoid ? Math.min(target.right, avoid.left, vw) : Math.min(target.right, vw);
  const lefts = [right - width - MARGIN, Math.max(target.left, 0) + MARGIN].map((value) => clamp(value, MARGIN, vw - width - MARGIN));
  const tops = [Math.min(target.bottom, vh) - height - MARGIN, Math.max(target.top, 0) + MARGIN].map((value) => clamp(value, MARGIN, vh - height - MARGIN));
  for (const top of tops) for (const left of lefts) if (free(top, left)) return { top, left, side: "none", caret: 0 };
  return { top: tops[0], left: lefts[0], side: "none", caret: 0 };
}

/**
 * The part of the target that can actually be seen: its box cut by every
 * scrolling or clipping box it sits in (the results scroll inside their own
 * column, under the step band) and by the window. Null when none of it shows.
 */
function visiblePart(element: HTMLElement): { box: DOMRect; clip: DOMRect } | null {
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  let top = 0;
  let left = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY)) continue;
    const edge = parent.getBoundingClientRect();
    top = Math.max(top, edge.top);
    left = Math.max(left, edge.left);
    right = Math.min(right, edge.right);
    bottom = Math.min(bottom, edge.bottom);
  }
  const clip = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  const shown = new DOMRect(
    Math.max(box.left, left),
    Math.max(box.top, top),
    Math.max(0, Math.min(box.right, right) - Math.max(box.left, left)),
    Math.max(0, Math.min(box.bottom, bottom) - Math.max(box.top, top)),
  );
  return shown.width > 0 && shown.height > 0 ? { box: shown, clip } : { box: new DOMRect(0, 0, 0, 0), clip };
}

/** Whether the target needs scrolling to: cut off at the top, or not yet in view. */
function needsScroll(element: HTMLElement, clip: DOMRect): boolean {
  const box = element.getBoundingClientRect();
  if (box.height <= clip.height) return box.top < clip.top - 1 || box.bottom > clip.bottom + 1;
  // Taller than its column: its top should be near the top of it, so most of it shows.
  return box.top < clip.top - 1 || box.top > clip.top + clip.height * 0.15;
}

export interface Point {
  x: number;
  y: number;
}

const samePoint = (a: Point | null, b: Point | null) => a === b || (!!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);

/** Where to click: the middle of an element's visible part, or a point already on screen. */
function clickPoint(source: HTMLElement | Point | null): Point | null {
  if (!source) return null;
  if (!(source instanceof HTMLElement)) {
    return source.x >= 0 && source.y >= 0 && source.x <= window.innerWidth && source.y <= window.innerHeight ? source : null;
  }
  const part = visiblePart(source);
  if (!part || part.box.width === 0) return null;
  const { left, top, width, height } = part.box;
  // A small control is aimed at low and to the right, so the pointer leaves its label readable;
  // a large one (a figure) at its middle.
  const x = left + width * (width < 90 ? 0.78 : 0.5);
  const y = top + height * (height < 60 ? 0.78 : 0.5);
  return { x, y };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The mouse pointer that shows where to click: it glides in from the
 * instruction panel to the control, then taps it, over and over, until the
 * step is done. It takes no clicks itself. Under reduced motion it simply
 * stands on the control with a still ring.
 */
function ClickPointer({ point, from }: { point: Point; from: Point | null }) {
  const [phase, setPhase] = useState<"start" | "moving" | "arrived">(() => (reducedMotion() || !from ? "arrived" : "start"));
  useEffect(() => {
    if (phase !== "start") return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("moving"));
    });
    const timer = setTimeout(() => setPhase("arrived"), 900);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const at = phase === "start" && from ? from : point;
  return (
    <div className={`pf-tour__pointer is-${phase}`} style={{ transform: `translate(${at.x}px, ${at.y}px)` }} aria-hidden="true">
      <span className="pf-tour__tap" />
      <span className="pf-tour__arrow">
        <PointerArrow size={26} />
      </span>
    </div>
  );
}

const sameBox = (a: DOMRect | null, b: DOMRect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

function Progress({ at }: { at: number }) {
  return (
    <div className="pf-tour__progress">
      <span className="metadata pf-ink-secondary">
        Step {pad(at)} of {pad(PROGRESS_STEPS)}
      </span>
      <ol className="pf-tour__dots" aria-hidden="true">
        {Array.from({ length: PROGRESS_STEPS }, (_, index) => (
          <li key={index} className={index + 1 < at ? "is-done" : index + 1 === at ? "is-current" : undefined} />
        ))}
      </ol>
    </div>
  );
}

/** One step: the spotlight on its target and the panel that says what to do. */
function Guide({ index }: { index: number }) {
  const def = STEPS[index];
  const goTo = useTour((state) => state.goTo);
  const finish = useTour((state) => state.finish);
  const skip = useTour((state) => state.skip);
  const store = useStore();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [overModal, setOverModal] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [avoid, setAvoid] = useState<DOMRect | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  /** The click point the panel keeps clear of: none when it is the panel's own button. */
  const [keepClear, setKeepClear] = useState<Point | null>(null);
  const entered = useRef<unknown>(undefined);
  const moved = useRef(false);

  const advance = () => {
    if (moved.current) return;
    moved.current = true;
    if (index + 1 < STEPS.length) goTo(index + 1);
    else finish();
  };

  // Entering the step: put the workspace where the step needs it, and look at the target once.
  useEffect(() => {
    moved.current = false;
    entered.current = def.onEnter?.(useStore.getState());
    // Bring the target into view while the page settles (a figure's image still loading, a
    // section appearing above it), for a short while after the step starts; the moment the
    // researcher scrolls for themselves, the tutorial leaves the scrolling to them.
    let foundAt: number | null = null;
    let lastScroll = -Infinity;
    let userScrolled = false;
    const onUserScroll = () => {
      userScrolled = true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) userScrolled = true;
    };
    window.addEventListener("wheel", onUserScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", onUserScroll, { capture: true, passive: true });
    window.addEventListener("keydown", onKey, true);
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /** For three seconds from when the target first shows, scroll to it whenever it is not in view. */
    const bringIntoView = (target: HTMLElement | null, part: ReturnType<typeof visiblePart>) => {
      if (!target || !part || userScrolled) return;
      const now = performance.now();
      foundAt ??= now;
      if (now - foundAt > 3000 || now - lastScroll < 450 || !needsScroll(target, part.clip)) return;
      lastScroll = now;
      const tall = target.getBoundingClientRect().height > part.clip.height * 0.6;
      target.scrollIntoView({ block: tall ? "start" : "center", behavior: reduce ? "auto" : "smooth" });
    };
    const tick = () => {
      const target = def.target();
      const part = target ? visiblePart(target) : null;
      bringIntoView(target, part);
      const visible = part && part.box.width > 0 ? part.box : null;
      setBox((previous) => (sameBox(previous, visible) ? previous : visible));
      // The connection panel: the tutorial keeps off it. For a control inside it, the
      // tutorial sits just left of the panel and points in, so the answer stays readable.
      const dock = window.matchMedia("(min-width: 900px)").matches ? document.querySelector<HTMLElement>(".pf-cw") : null;
      const inside = Boolean(dock && target && dock.contains(target));
      const dockBox = dock?.getBoundingClientRect() ?? null;
      const avoidBox = dockBox && !inside ? dockBox : null;
      const anchorBox = inside && dockBox && visible ? new DOMRect(dockBox.left, visible.top, 1, visible.height) : visible;
      setAvoid((previous) => (sameBox(previous, avoidBox) ? previous : avoidBox));
      setAnchor((previous) => (sameBox(previous, anchorBox) ? previous : anchorBox));
      // Where to click, followed every frame (a scroll, a turned 3D network).
      const source = def.point?.() ?? null;
      const next = clickPoint(source);
      setPoint((previous) => (samePoint(previous, next) ? previous : next));
      // A button inside the panel moves with it: keeping clear of it would chase it away every frame.
      const own = source instanceof HTMLElement && panel.current?.contains(source);
      const clear = own ? null : next;
      setKeepClear((previous) => (samePoint(previous, clear) ? previous : clear));
      setOverModal(Boolean(target?.closest(".pf-modal-layer")));
      if (def.done?.(useStore.getState(), entered.current)) advance();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Frames pause while the page is hidden; the step still moves on when its action is done.
    const check = setInterval(() => {
      const target = def.target();
      bringIntoView(target, target ? visiblePart(target) : null);
      if (def.done?.(useStore.getState(), entered.current)) advance();
    }, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(check);
      window.removeEventListener("wheel", onUserScroll, { capture: true });
      window.removeEventListener("touchmove", onUserScroll, { capture: true });
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // A step that ends on a press: the target's own click does its work first, then the tutorial moves on.
  useEffect(() => {
    if (!def.doneOnClick) return;
    const onClick = (event: MouseEvent) => {
      const target = def.target();
      const pressed = event.target instanceof Element ? event.target : null;
      const match = def.clickMatch ? pressed?.closest(def.clickMatch) : null;
      const pressedTarget = def.clickMatch ? Boolean(match) : Boolean(target && event.target instanceof Node && target.contains(event.target));
      if (pressedTarget) setTimeout(advance, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const next = place(anchor, element.offsetWidth, element.offsetHeight, def.prefer, avoid, keepClear);
    setPlacement((previous) =>
      previous && previous.top === next.top && previous.left === next.left && previous.side === next.side && previous.caret === next.caret
        ? previous
        : next,
    );
  });

  const waiting = def.waiting?.(store) ?? null;
  // The pointer starts from the instruction panel, so the eye follows it from the words to the control.
  const pointerFrom = placement && panel.current ? { x: placement.left + panel.current.offsetWidth / 2, y: placement.top + panel.current.offsetHeight / 2 } : null;
  const action = def.action?.(store) ?? null;
  const spot: CSSProperties | undefined = box
    ? {
        top: Math.max(box.top - PAD, 0),
        left: box.left - PAD,
        width: box.width + PAD * 2,
        height: Math.min(box.bottom + PAD, window.innerHeight) - Math.max(box.top - PAD, 0),
      }
    : undefined;

  return (
    <>
      {spot ? (
        <div className={`pf-tour__spot${overModal ? " is-over-modal" : ""}`} style={spot} aria-hidden="true" />
      ) : (
        <div className="pf-tour__dim" aria-hidden="true" />
      )}
      <div
        ref={panel}
        className={`pf-tour pf-tour--${placement?.side ?? "none"}${overModal ? " is-over-modal" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        style={{
          top: placement?.top ?? -9999,
          left: placement?.left ?? -9999,
          ["--caret" as string]: `${placement?.caret ?? 0}px`,
        }}
      >
        <Progress at={def.progress} />
        <h2 className="pf-tour__title" id={titleId}>
          {def.title}
        </h2>
        <div className="pf-tour__body small" aria-live="polite">
          {waiting ?? def.body(store)}
        </div>
        <div className="pf-tour__actions">
          <button type="button" className="ml-btn ml-btn--ghost pf-tour__skip" onClick={skip}>
            Skip tutorial
          </button>
          {action && !waiting && (
            <button type="button" className="ml-btn ml-btn--primary" onClick={action.run} data-tour-action="">
              {action.label}
            </button>
          )}
          {def.next && (
            <button
              type="button"
              className="ml-btn ml-btn--primary"
              onClick={() => {
                def.onNext?.();
                advance();
              }}
            >
              {def.next}
            </button>
          )}
        </div>
      </div>
      {point && !waiting && <ClickPointer key={index} point={point} from={pointerFrom} />}
    </>
  );
}

/** Away from the example analysis: say so, and offer the way back. */
function Paused({ projectId }: { projectId: string }) {
  const skip = useTour((state) => state.skip);
  const titleId = useId();
  return (
    <div className="pf-tour pf-tour--none pf-tour--paused" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <h2 className="pf-tour__title" id={titleId}>
        Tutorial paused
      </h2>
      <p className="small pf-tour__body">You left the example analysis. Go back to carry on where you were.</p>
      <div className="pf-tour__actions">
        <button type="button" className="ml-btn ml-btn--ghost pf-tour__skip" onClick={skip}>
          Skip tutorial
        </button>
        <button type="button" className="ml-btn ml-btn--primary" onClick={() => navigate(`/projects/${projectId}`)}>
          Return to the tutorial
        </button>
      </div>
    </div>
  );
}

export function Tour() {
  const phase = useTour((state) => state.phase);
  const step = useTour((state) => state.step);
  const projectId = useTour((state) => state.projectId);
  const problem = useTour((state) => state.problem);
  const start = useTour((state) => state.start);
  const skip = useTour((state) => state.skip);
  const complete = useTour((state) => state.complete);
  const returnTo = useTour((state) => state.returnTo);
  const here = useStore((state) => (state.project && state.source ? state.project.name : null));
  const openProject = useStore((state) => state.project?.id ?? null);
  const boundProject = useBound((state) => state.id);
  const { pathname } = useLocation();

  if (phase === "closed") return null;

  if (phase === "intro" || phase === "starting") {
    return (
      <Modal
        title="Let's explore how ideas connect."
        onClose={skip}
        actions={
          <>
            <button type="button" className="ml-btn ml-btn--ghost" onClick={skip}>
              Skip tutorial
            </button>
            <button type="button" className="ml-btn ml-btn--primary" disabled={phase === "starting"} onClick={() => void start()}>
              {phase === "starting" ? "Opening the example…" : "Start tutorial"}
            </button>
          </>
        }
      >
        <div className="pf-tour__intro">
          <p>
            You'll make your first IdeaLens analysis with an example dataset: students talking about online learning.
            Step by step, in the real workspace, you'll add the data, run the analysis and read how the ideas connect.
          </p>
          {here && (
            <p>
              The tutorial opens in a separate example analysis. <b>{here}</b> stays as it is, saved in your history, and
              you come back to it when the tutorial ends.
            </p>
          )}
          <p className="small pf-note">About five minutes. Skip it now and start it again any time from your account menu.</p>
          {problem && <FlagNote>{problem}</FlagNote>}
        </div>
      </Modal>
    );
  }

  if (phase === "finished") {
    return (
      <Modal
        title="You've completed your first IdeaLens analysis."
        onClose={() => complete()}
        actions={
          returnTo ? (
            <>
              <button type="button" className="ml-btn ml-btn--ghost" onClick={() => complete(true)}>
                Stay in the example
              </button>
              <button type="button" className="ml-btn ml-btn--primary" onClick={() => complete()}>
                Back to {returnTo.name}
              </button>
            </>
          ) : (
            <button type="button" className="ml-btn ml-btn--primary" onClick={() => complete()}>
              Start exploring
            </button>
          )
        }
      >
        <p>
          {returnTo
            ? `${returnTo.name} is where you left it. Everything you just did stays in the example analysis, in your history.`
            : "You can now upload your own research and explore how your ideas connect."}
        </p>
      </Modal>
    );
  }

  if (!projectId) return null;
  if (pathname !== `/projects/${projectId}`) return <Paused projectId={projectId} />;
  // The workspace opens the analysis and starts saving it first; the steps start once it has,
  // so whatever a step changes (the example's settings, say) is saved with it.
  if (openProject !== projectId || boundProject !== projectId) return null;
  return <Guide key={step} index={step} />;
}
