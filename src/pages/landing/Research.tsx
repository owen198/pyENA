import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "../../data/load";
import { parseText } from "../../data/parse";
import { Link } from "../../router";
import { useSession } from "../../state/session";
import { ArrowIcon, CheckIcon, PointerArrow } from "../../ui/marks";
// The example research is the tutorial's dataset (scripts/build-tutorial-data.py),
// so the size, rows and columns the demo shows are a real file's.
import researchCsv from "../../../public/samples/online_learning.csv?raw";
import codebookCsv from "../../../public/samples/online_learning_codebook.csv?raw";

const FILE_NAME = "student_experience_research.csv";
const FILE_SIZE = new Blob([researchCsv]).size;
const TABLE = parseText(researchCsv, { delimiter: "auto", header: true });
const PREVIEW_COLUMNS = ["Participant", "Enrollment", "Text"].filter((column) => TABLE.columns.includes(column));

/** What sits beside it in the researcher's folder, as a file picker shows it. */
const FOLDER = [
  { name: "focus_group_notes.docx", kind: "DOCX", size: 48_211, readable: false },
  { name: FILE_NAME, kind: "CSV", size: FILE_SIZE, readable: true },
  { name: "codebook.csv", kind: "CSV", size: new Blob([codebookCsv]).size, readable: true },
];

// ---------------------------------------------------------------------------
// The sequence, as positions along the section's scroll (0 to 1)
// ---------------------------------------------------------------------------

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const v = clamp01(value);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const span = (p: number, from: number, to: number) => ease((p - from) / (to - from));
const linear = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
const within = (p: number, from: number, to: number) => p >= from && p < to;

const AT = {
  pressChoose: [0.14, 0.17],
  picker: [0.17, 0.22, 0.37, 0.41],
  selectRow: 0.27,
  pressOpen: [0.34, 0.37],
  card: [0.38, 0.44],
  pressUpload: [0.5, 0.53],
  upload: [0.53, 0.72],
  uploaded: 0.72,
  ready: [0.8, 0.88],
} as const;

/** Where the pointer is headed at p: from rest to each control, in turn. */
const PATH: { at: number; to: "rest" | "choose" | "file" | "open" | "upload" }[] = [
  { at: 0.05, to: "rest" },
  { at: 0.13, to: "choose" },
  { at: 0.2, to: "choose" },
  { at: 0.26, to: "file" },
  { at: 0.29, to: "file" },
  { at: 0.33, to: "open" },
  { at: 0.42, to: "open" },
  { at: 0.49, to: "upload" },
  { at: 0.56, to: "upload" },
  { at: 0.66, to: "rest" },
];

/** Reduced motion: the demo shows each stage finished, never in between. */
const STILLS = [0.02, 0.3, 0.46, 0.63, 0.76, 1];
const still = (p: number) => STILLS.reduce((best, value) => (Math.abs(value - p) < Math.abs(best - p) ? value : best));

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const list = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return reduce;
}


/**
 * The workspace's first step, played by the scroll: an empty upload area, a
 * file chosen from the researcher's folder, the file as the workspace shows a
 * source, the upload, and the research ready. One interface throughout; only
 * the file's state changes.
 */
function UploadDemo({ p: raw }: { p: number }) {
  const reduce = useReducedMotion();
  const p = reduce ? still(raw) : raw;
  const box = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const targets = {
    choose: useRef<HTMLButtonElement>(null),
    file: useRef<HTMLLIElement>(null),
    open: useRef<HTMLButtonElement>(null),
    upload: useRef<HTMLButtonElement>(null),
  };

  // The pointer travels between the controls' real positions, wherever the layout puts them (relative to the body it moves in).
  useLayoutEffect(() => {
    const frame = box.current?.getBoundingClientRect();
    const element = pointer.current;
    if (!frame || !element) return;
    const at = (key: (typeof PATH)[number]["to"]) => {
      if (key === "rest") return { x: frame.width * 0.82, y: frame.height * 0.9 };
      const rect = targets[key].current?.getBoundingClientRect();
      if (!rect) return { x: frame.width * 0.82, y: frame.height * 0.9 };
      return { x: rect.left - frame.left + rect.width * 0.55, y: rect.top - frame.top + rect.height * 0.55 };
    };
    let index = PATH.findIndex((point) => point.at > p);
    if (index === -1) index = PATH.length;
    const from = PATH[Math.max(0, index - 1)];
    const to = PATH[Math.min(PATH.length - 1, index)];
    const share = to.at === from.at ? 1 : ease((p - from.at) / (to.at - from.at));
    const [a, b] = [at(from.to), at(to.to)];
    element.style.transform = `translate(${a.x + (b.x - a.x) * share}px, ${a.y + (b.y - a.y) * share}px)`;
    element.style.opacity = String(reduce ? 0 : span(p, 0.03, 0.07) * (1 - span(p, 0.62, 0.68)));
  });

  const pickerIn = span(p, AT.picker[0], AT.picker[1]) * (1 - span(p, AT.picker[2], AT.picker[3]));
  const rowSelected = p >= AT.selectRow;
  const cardIn = span(p, AT.card[0], AT.card[1]);
  const progress = linear(p, AT.upload[0], AT.upload[1]);
  const uploading = within(p, AT.upload[0], AT.uploaded);
  const uploaded = p >= AT.uploaded;
  const readyIn = span(p, AT.ready[0], AT.ready[1]);

  const status = uploaded ? (
    <>
      <span className="pf-save__dot" />
      Saved
    </>
  ) : uploading ? (
    <>
      <span className="pf-save__dot is-busy" />
      Uploading…
    </>
  ) : cardIn > 0.5 ? (
    <>
      <span className="pf-save__dot st-up__dot--idle" />
      Not uploaded
    </>
  ) : (
    <>
      <span className="pf-save__dot st-up__dot--idle" />
      No data yet
    </>
  );

  return (
    <figure
      className="st-up"
      role="img"
      aria-label={`A demonstration: ${FILE_NAME} is chosen from a folder, uploaded to IdeaLens, and is ready to analyse.`}
    >
      <div className="st-up__window" inert>
        <div className="st-up__bar">
          <span className="label">Online learning study</span>
          <span className="pf-save small">{status}</span>
        </div>
        <div className="st-up__step">
          <p className="metadata pf-ink-secondary">01</p>
          <p className="st-up__step-title">Upload data</p>
        </div>

        <div className="st-up__body" ref={box}>
          {/* Empty: the upload area, waiting for a file. */}
          <div className="pf-drop st-up__layer st-up__drop" style={{ opacity: 1 - cardIn }}>
            <ArrowIcon size={24} className="pf-icon--up" />
            <p className="label">Drag a CSV file here</p>
            <p className="small pf-note">or</p>
            <button
              type="button"
              ref={targets.choose}
              className={`ml-btn ml-btn--primary${within(p, AT.pressChoose[0], AT.pressChoose[1]) ? " is-pressed" : ""}`}
            >
              Choose CSV file
            </button>
          </div>

          {/* The file, once chosen: the same card from selected to ready. */}
          <div className="st-up__layer st-up__file" style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 6}px)` }}>
            <div className="ml-source st-up__source">
              <span className="ml-source__id">Source 001</span>
              <div className="ml-source__title">
                {uploaded && <CheckIcon size={18} className="st-up__check" />}
                {FILE_NAME}
              </div>
              <div className="ml-source__meta">
                {uploaded ? (
                  <>
                    <span>
                      {TABLE.rows.length.toLocaleString("en-US")} rows / {TABLE.columns.length} columns
                    </span>
                    <span>{formatBytes(FILE_SIZE)}</span>
                    <span>comma-separated</span>
                  </>
                ) : (
                  <>
                    <span>CSV</span>
                    <span>{formatBytes(FILE_SIZE)}</span>
                    <span>{uploading ? `Uploading research… ${Math.round(progress * 100)}%` : "Ready to upload"}</span>
                  </>
                )}
              </div>
              {!uploaded && !uploading && (
                <div className="st-up__actions">
                  <button
                    type="button"
                    ref={targets.upload}
                    className={`ml-btn ml-btn--primary${within(p, AT.pressUpload[0], AT.pressUpload[1]) ? " is-pressed" : ""}`}
                  >
                    Upload
                  </button>
                  <span className="ml-source__action">Remove</span>
                </div>
              )}
              {(uploading || uploaded) && (
                <div className="st-up__progress" style={{ opacity: uploaded ? 1 - readyIn : 1 }}>
                  <span style={{ transform: `scaleX(${progress})` }} />
                </div>
              )}
              {uploaded && <p className="label st-up__ready">Ready to analyze</p>}
            </div>

            <div className="st-up__preview" style={{ opacity: readyIn, transform: `translateY(${(1 - readyIn) * 6}px)` }}>
              <table className="pf-table">
                <thead>
                  <tr>
                    {PREVIEW_COLUMNS.map((column) => (
                      <th key={column} scope="col" className="label">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLE.rows.slice(0, 3).map((row, index) => (
                    <tr key={index} className={`pf-row-data${index % 2 === 1 ? " is-odd" : ""}`}>
                      {PREVIEW_COLUMNS.map((column) => (
                        <td key={column}>{row[column]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* The file picker, over the workspace while the file is chosen. */}
          <div className="st-up__picker" style={{ opacity: pickerIn, transform: `translateY(${(1 - pickerIn) * 8}px)`, visibility: pickerIn > 0.01 ? "visible" : "hidden" }}>
            <div className="st-up__picker-head">
              <span className="label">Open a file</span>
              <span className="metadata pf-ink-secondary">Research / Online learning study</span>
            </div>
            <ul className="st-up__files">
              {FOLDER.map((file) => (
                <li
                  key={file.name}
                  ref={file.name === FILE_NAME ? targets.file : undefined}
                  className={`${file.readable ? "" : "is-unreadable"}${file.name === FILE_NAME && rowSelected ? " is-selected" : ""}`}
                >
                  <span className="st-up__file-name">{file.name}</span>
                  <span className="small pf-note">
                    {file.kind} / {formatBytes(file.size)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="st-up__picker-actions">
              <span className="ml-btn ml-btn--ghost">Cancel</span>
              <button
                type="button"
                ref={targets.open}
                className={`ml-btn ml-btn--primary${within(p, AT.pressOpen[0], AT.pressOpen[1]) ? " is-pressed" : ""}`}
                disabled={!rowSelected}
              >
                Open
              </button>
            </div>
          </div>

          <div className="st-up__pointer" ref={pointer} aria-hidden="true">
            <PointerArrow />
          </div>
        </div>
      </div>
    </figure>
  );
}

/**
 * Your research: how research enters IdeaLens, played by the scroll. The demo
 * leads on the left, the words follow on the right: the reverse of the
 * showcase above, which this section never repeats.
 */
export function Research() {
  const status = useSession((state) => state.status);
  const titleId = useId();
  const track = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const signedIn = status === "signedIn";

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = track.current?.getBoundingClientRect();
      if (!rect) return;
      const travel = Math.max(1, rect.height - window.innerHeight);
      setProgress(clamp01(-rect.top / travel));
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
  }, []);

  const text = useMemo(
    () => (
      <div className="st-research__text">
        <p className="metadata pf-ink-secondary">Your research</p>
        <h2 className="st-h2" id={titleId}>
          Bring your research into IdeaLens.
        </h2>
        <p className="body-lg">Upload the files you already work with and get them ready to explore.</p>
        <div className="st-research__cta">
          <Link to={signedIn ? "/projects" : "/signup"} className="ml-btn ml-btn--secondary">
            {signedIn ? "Open your analyses" : "Create an account"}
          </Link>
        </div>
      </div>
    ),
    [signedIn, titleId],
  );

  return (
    <section className="st-section st-section--soft st-research" id="research" aria-labelledby={titleId}>
      <div className="st-research__track" ref={track}>
        <div className="st-research__sticky">
          <div className="st-research__grid">
            <UploadDemo p={progress} />
            {text}
          </div>
        </div>
      </div>
    </section>
  );
}
