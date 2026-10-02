import { useEffect, useRef, useState } from "react";
import type { TourApi } from "../TourFrame";
import { TOUR_NAME } from "../TourFrame";

/** The platform's own size inside the frame: a laptop screen. */
const APP = { w: 1280, h: 800 };
const MOVE = 700;
const PRESS = 320;

interface TourStep {
  title: string;
  body: string;
  /** The control pressed to get here from the step before, in the step before. */
  press?: string;
  /** What the view closes in on once here, and where the pointer rests. */
  focus: string;
  point?: string;
  /** How close in, at most. */
  zoom?: number;
}

const STEPS: TourStep[] = [
  {
    title: "Name your research",
    body: "Every analysis starts with a name. It is how you find the analysis again in your history, with everything it holds.",
    focus: ".pf-research",
    point: ".pf-research input",
    zoom: 2.4,
  },
  {
    title: "Bring in coded data",
    body: "Drag a coded CSV anywhere onto the page, or load one of the pyENA examples. A coding schema can come with it, to name each code by what it means.",
    press: 'button[aria-label="Load the RS.data example"]',
    focus: ".pf-rail .ml-source",
    zoom: 2.2,
  },
  {
    title: "Look before anything is computed",
    body: "Preview shows the table as it was read, with the columns that can be codes, and the coding schema beside it.",
    press: ".pf-band__side--end .pf-band__btn",
    focus: ".pf-canvas",
    point: ".pf-canvas .pf-tabs",
    zoom: 1.35,
  },
  {
    title: "Choose what the network is made of",
    body: "Units, conversation, codes, the stanza window and the two groups to compare. Each example offers the configuration its own pyENA script uses.",
    press: ".pf-callout .ml-btn--secondary",
    focus: ".pf-rail .pf-group",
    point: ".pf-chips",
    zoom: 1.8,
  },
  {
    title: "Run it, in your browser",
    body: "Run analysis sums up exactly what will run. pyENA itself runs in the browser, in Python, and shows each stage as it goes.",
    press: ".pf-band__side--end .pf-band__btn",
    focus: ".pf-rail .pf-step__body",
    point: ".pf-runbar .ml-btn--primary",
    zoom: 1.5,
  },
  {
    title: "Read the networks",
    body: "The twelve figures pyENA draws, each on graph paper in its own coordinates: mean and subtracted networks, the points, and single units side by side.",
    press: ".pf-runbar .ml-btn--primary",
    focus: ".pf-figure",
    point: ".pf-figure__plot",
    zoom: 1.6,
  },
  {
    title: "Every statistic, with its test",
    body: "Welch's t, Mann–Whitney U and ANOVA on each dimension, chi-square on code frequency and goodness of fit, each with its n and p.",
    press: "#tab-statistics",
    focus: ".pf-canvas .pf-results__body",
    point: "#tab-statistics",
    zoom: 1.3,
  },
  {
    title: "Written up for you",
    body: "The interpretation follows pyENA's own guide, in its order, with every number from the summary and codes named by their meaning. Copy it, download it, keep it with the analysis.",
    press: "#tab-interpretation",
    focus: ".pf-interpret__text",
    zoom: 1.5,
  },
];

interface Camera {
  x0: number;
  y0: number;
  z: number;
}

const WHOLE: Camera = { x0: 0, y0: 0, z: 1 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function frameOn(whole: { x: number; y: number; width: number; height: number }, most: number): Camera {
  // A tall or wide area (a panel of settings, a figure) is framed from its top
  // left, so the view still closes in on what the step is about.
  const rect = { x: whole.x, y: whole.y, width: Math.min(whole.width, APP.w * 0.62), height: Math.min(whole.height, APP.h * 0.56) };
  const z = Math.max(1, Math.min(most, (APP.w * 0.86) / rect.width, (APP.h * 0.86) / rect.height));
  const vw = APP.w / z;
  const vh = APP.h / z;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return {
    z,
    x0: Math.max(0, Math.min(APP.w - vw, cx - vw / 2)),
    y0: Math.max(0, Math.min(APP.h - vh, cy - vh / 2)),
  };
}

/**
 * The platform itself, introduced by scrolling. The real workspace runs in a
 * frame; as each instruction reaches the reading line, a pointer moves to the
 * control that leads there and presses it, the workspace moves on, and the
 * view closes in on what matters at that step. Visitors cannot press anything
 * in it, and the scroll wheel always moves the page.
 */
export function PlatformTour() {
  const [active, setActive] = useState(0);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [camera, setCamera] = useState<Camera>(WHOLE);
  const [pointer, setPointer] = useState<{ x: number; y: number; visible: boolean }>({ x: APP.w * 0.6, y: APP.h * 0.7, visible: false });
  const [pressing, setPressing] = useState(0);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const section = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const shown = useRef(-1);
  const run = useRef(0);

  // The frame loads only as the tour comes near.
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "800px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The instruction that crosses the reading line is the step shown.
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 899px)").matches;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: narrow ? "-58% 0px -41% 0px" : "-49% 0px -50% 0px" },
    );
    refs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const tour = (): TourApi | null => iframe.current?.contentWindow?.pyenaTour ?? null;

  // Wait for the platform in the frame to say it is ready.
  useEffect(() => {
    if (!near || ready) return;
    const timer = setInterval(() => {
      if (tour()) {
        setReady(true);
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [near, ready]);

  // Moving to a step: press the way there, move the platform on, close in.
  useEffect(() => {
    const api = tour();
    if (!ready || !api) return;
    const id = ++run.current;
    const current = () => id === run.current;
    const pause = (ms: number) => (reduced ? Promise.resolve() : sleep(ms));
    const step = STEPS[active];
    const from = shown.current;

    // What a step shows can take a frame or two to appear (the interpretation
    // writes itself as its tab opens), so look for it a few times.
    const settle = async () => {
      for (let attempt = 0; attempt < 8 && current(); attempt++) {
        const focus = api.rect(step.focus);
        const point = api.rect(step.point ?? step.focus);
        if (focus && point) {
          setCamera(frameOn(focus, step.zoom ?? 1.6));
          setPointer({ x: point.x + Math.min(point.width / 2, 60), y: point.y + Math.min(point.height / 2, 22), visible: true });
          return;
        }
        await sleep(120);
      }
      setCamera(WHOLE);
    };

    void (async () => {
      if (from === active - 1 && step.press && !reduced) {
        // One step forward: the pointer goes to the control and presses it.
        const control = api.rect(step.press);
        if (control) {
          setCamera(frameOn(control, 1.25));
          setPointer({ x: control.x + control.width / 2, y: control.y + control.height / 2, visible: true });
          await pause(MOVE);
          if (!current()) return;
          setPressing((count) => count + 1);
          await pause(PRESS);
          if (!current()) return;
        }
      }
      await api.show(active);
      if (!current()) return;
      shown.current = active;
      await settle();
      if (active === 0) {
        // The name, typed.
        for (let length = 1; length <= TOUR_NAME.length; length += 2) {
          await pause(45);
          if (!current()) return;
          api.typeName(TOUR_NAME.slice(0, length));
        }
        api.typeName(TOUR_NAME);
      }
    })();
  }, [active, ready, reduced]);

  const scale = width / APP.w;
  const pointerAt = {
    x: (pointer.x - camera.x0) * camera.z * scale,
    y: (pointer.y - camera.y0) * camera.z * scale,
  };

  return (
    <section className="st-section st-storysection" id="platform" aria-labelledby="platform-title" ref={section}>
      <div className="st-block st-storysection__head">
        <p className="metadata pf-ink-secondary">Platform</p>
        <h2 className="st-h2" id="platform-title">
          The platform, a step at a time
        </h2>
        <p className="body-lg st-lead">
          Scroll on, and follow the pointer through the real workspace: one analysis of RS.data, from its name to its
          interpretation.
        </p>
      </div>
      <div className="st-story">
        <div className="st-story__stage">
          <div className="st-story__frame">
            <div className={`pt-frame${reduced ? " is-still" : ""}`} ref={frame}>
              <div
                className="pt-zoom"
                style={{
                  transform: `scale(${scale * camera.z}) translate(${-camera.x0}px, ${-camera.y0}px)`,
                }}
              >
                {near && (
                  <iframe
                    ref={iframe}
                    className="pt-app"
                    src="/tour"
                    title="The pyENA platform"
                    tabIndex={-1}
                    aria-hidden="true"
                    width={APP.w}
                    height={APP.h}
                  />
                )}
              </div>
              {/* Nothing in the frame can be pressed, and the wheel always scrolls the page. */}
              <div className="pt-shield" role="img" aria-label={`The platform at step ${active + 1}: ${STEPS[active].title}.`} />
              <div
                className={`pt-pointer${pointer.visible && ready ? " is-visible" : ""}`}
                style={{ transform: `translate(${pointerAt.x}px, ${pointerAt.y}px)` }}
                aria-hidden="true"
              >
                <span key={pressing} className={pressing ? "pt-pointer__press" : undefined} />
                <svg viewBox="0 0 24 24" width="26" height="26">
                  <path d="M4 2.5 L4 19.5 L8.6 15.4 L11.6 22 L14.6 20.6 L11.7 14.2 L18 14.2 Z" />
                </svg>
              </div>
              {!ready && <p className="pt-loading small pf-note">Opening the platform…</p>}
            </div>
            <p className="st-story__caption metadata pf-ink-secondary" aria-hidden="true">
              {String(active + 1).padStart(2, "0")} / {STEPS[active].title}
            </p>
          </div>
        </div>
        <ol className="st-story__steps">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              data-step={index}
              ref={(element) => {
                refs.current[index] = element;
              }}
              className={`st-step${index === active ? " is-active" : ""}`}
            >
              <p className="metadata pf-ink-secondary">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="st-step__title">{step.title}</h3>
              <p className="body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
