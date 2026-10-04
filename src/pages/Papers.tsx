// The Papers page: the team's own papers as a centred pair of cards under the
// pale blue heading. A Network bloom drawing sits across the heading's lower
// edge and draws itself in as the heading arrives: stem first, then the leaves
// and the node heads, then the two small numbered notes that point to the
// papers below. Between the cards, a thin bracket marks the one thing the
// papers share in the data itself: the authors they have in common.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { OUR_PAPERS, type Paper, type PaperSticker } from "../content/site";
import { pad } from "../steps";
import { ArrowIcon } from "../ui/marks";
import {
  CodedTalkSticker,
  NetworkBloomSticker,
  NodeClusterSticker,
  ProjectedPointsSticker,
  StanzaWindowSticker,
} from "../ui/stickers";
import { useArrival } from "../ui/useArrival";
import { SitePage } from "./Site";

export function PapersPage() {
  // The pair settles in as soon as the page opens, and again each time it scrolls back into view.
  const pair = useArrival<HTMLDivElement>({ playOnLoad: true });
  const shared = OUR_PAPERS.length >= 2 ? sharedAuthors(OUR_PAPERS[0], OUR_PAPERS[1]) : [];
  const years = OUR_PAPERS.map((paper) => paper.year);
  const span = years.length ? (Math.min(...years) === Math.max(...years) ? `${years[0]}` : `${Math.min(...years)}–${Math.max(...years)}`) : "";

  return (
    <SitePage
      eyebrow="Papers"
      title="Papers"
      lead={
        <>
          Research from the IdeaLens team.
          <br />
          Papers exploring how ideas connect, develop, and become evidence.
        </>
      }
      entrance
      grid
      seam={<PaperBloom />}
    >
      <div className="st-papers">
        <div className="st-papers__head">
          <h2 className="st-h3">Our papers</h2>
          <p className="metadata pf-ink-secondary">
            {pad(OUR_PAPERS.length)} papers{span && ` / ${span}`}
          </p>
        </div>
        <div className={`st-papers__pair${pair.state}`} ref={pair.ref} style={{ "--n": OUR_PAPERS.length } as CSSProperties}>
          {shared.length > 0 && (
            <div className="st-papers__link">
              <span className="st-papers__dot st-papers__dot--start" aria-hidden="true" />
              <p className="st-papers__shared">
                <span className="metadata">{shared.join("; ")}</span>{" "}
                <span className="small">
                  {shared.length === 1 ? "is an author" : "are authors"} on papers {pad(1)} and {pad(2)}
                </span>
              </p>
              <span className="st-papers__dot st-papers__dot--end" aria-hidden="true" />
            </div>
          )}
          <ol className="st-paper-grid">
            {OUR_PAPERS.map((paper, index) => (
              <PaperCard key={paper.title} paper={paper} index={index} />
            ))}
          </ol>
        </div>
      </div>
    </SitePage>
  );
}

/**
 * The people in a citation's author list, as cited ("Lu, O. H. T."): each is a
 * surname followed by its initials, the last one after "&".
 */
function authorsOf(paper: Paper): string[] {
  return [...paper.authors.matchAll(/\s*(?:&\s*)?([^,&]+?),\s*((?:[A-Z]\.(?:\s|-)?)+)(?:,|$)/g)].map(
    (match) => `${match[1].trim()}, ${match[2].trim()}`,
  );
}

/** Authors who appear in both papers' author lists, in the first paper's order. */
function sharedAuthors(a: Paper, b: Paper): string[] {
  const inB = new Set(authorsOf(b));
  return authorsOf(a).filter((author) => inB.has(author));
}

/**
 * The Network bloom sticker's own geometry (src/ui/stickers.tsx), set in a
 * wider frame so two small notes fit beside it: the side heads are numbered
 * 01 and 02 for the two papers, and a dashed arc rings the focal node. Each
 * part carries a class so the page can draw it in order; at rest, or under
 * reduced motion, it is simply the finished drawing.
 */
function PaperBloom() {
  const { ref, state } = useArrival<HTMLDivElement>({ playOnLoad: true });
  return (
    <div className={`st-bloom${state}`} ref={ref} aria-hidden="true">
      <svg viewBox="0 0 200 170" focusable="false">
        <g transform="translate(46 50)">
          <path className="ml-sticker-ink st-bloom__stem" pathLength={1} strokeWidth="3.5" d="M61,118 C58,100 64,88 57,74 C52,62 55,52 58,44" />
          <path className="ml-sticker-ink st-bloom__branch" pathLength={1} d="M56,76 C46,76 37,70 32,60" />
          <path className="ml-sticker-ink st-bloom__branch" pathLength={1} d="M57,64 C67,64 77,58 83,50" />
          <path className="ml-sticker-fill-brand st-bloom__leaf" d="M58,98 C47,99 38,93 35,84 C45,80 55,86 58,98 Z" />
          <path className="ml-sticker-fill-brand st-bloom__leaf" d="M60,88 C71,89 79,83 82,74 C72,71 62,77 60,88 Z" />
          <path className="ml-sticker-ink st-bloom__edge" strokeWidth="2" strokeDasharray="4 5" d="M48,40 C42,44 37,50 34,54" />
          <path className="ml-sticker-ink st-bloom__edge" strokeWidth="2" strokeDasharray="4 5" d="M68,38 C74,40 79,43 82,46" />
          <ellipse className="ml-sticker-fill-accent st-bloom__node" cx="58" cy="32" rx="12" ry="11" transform="rotate(-7 58 32)" />
          <ellipse className="ml-sticker-fill-blue st-bloom__node" cx="29" cy="57" rx="9" ry="8.4" transform="rotate(9 29 57)" />
          <ellipse className="ml-sticker-fill-paper st-bloom__node" cx="86" cy="47" rx="9.5" ry="8.8" transform="rotate(-11 86 47)" />
        </g>
        {/* The notes: a dashed ring over the focal node, and a leader from each side head to its paper's number. */}
        <path className="ml-sticker-hair st-bloom__note" d="M84,70 C90,60 116,58 124,68" />
        <path className="st-bloom__leader" pathLength={1} d="M66,104 C56,100 46,96 38,95" />
        <path className="st-bloom__leader" pathLength={1} d="M141,92 C150,86 158,82 166,81" />
        <circle className="st-bloom__tip" cx="38" cy="95" r="2" />
        <circle className="st-bloom__tip" cx="166" cy="81" r="2" />
        <text className="st-bloom__label" x="33" y="99" textAnchor="end">
          01
        </text>
        <text className="st-bloom__label" x="171" y="85">
          02
        </text>
      </svg>
    </div>
  );
}

const STICKERS: Record<PaperSticker, (props: { className?: string }) => ReactNode> = {
  "network-bloom": NetworkBloomSticker,
  "node-cluster": NodeClusterSticker,
  "coded-talk": CodedTalkSticker,
  "stanza-window": StanzaWindowSticker,
  "projected-points": ProjectedPointsSticker,
};
/** For a paper with no thumbnail of its own: turn by turn through the set, on alternating washes. */
const FALLBACK_STICKERS: PaperSticker[] = ["network-bloom", "coded-talk", "projected-points", "stanza-window", "node-cluster"];
const FALLBACK_FIELDS = ["blue", "red", "paper"] as const;

/** The reference as a reader would paste it into a reference list (APA). */
function citationText(paper: Paper): string {
  const where = paper.doi ? ` https://doi.org/${paper.doi}` : paper.url ? ` ${paper.url}` : "";
  return `${paper.authors} (${paper.year}). ${paper.title}. ${paper.venue}${paper.pages ? `, ${paper.pages}` : ""}.${where}`;
}

/**
 * Puts text on the clipboard. The Clipboard API exists only on HTTPS and
 * localhost, so a visitor on the plain-HTTP network address falls back to the
 * older select-and-copy; false when neither works.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {
      done = false;
    }
    area.remove();
    return done;
  }
}

function PaperCard({ paper, index }: { paper: Paper; index: number }) {
  const thumbnail = paper.thumbnail ?? {
    sticker: FALLBACK_STICKERS[index % FALLBACK_STICKERS.length],
    field: FALLBACK_FIELDS[index % FALLBACK_FIELDS.length],
  };
  const Sticker = STICKERS[thumbnail.sticker];
  // "copied" for a moment after a copy; "shown" when the browser would not copy, so the reader can select it.
  const [copied, setCopied] = useState<"" | "copied" | "shown">("");
  useEffect(() => {
    if (copied !== "copied") return;
    const timer = window.setTimeout(() => setCopied(""), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void copyText(citationText(paper)).then((done) => setCopied(done ? "copied" : "shown"));
  };

  return (
    <li className="st-paper-item" style={{ "--i": index } as CSSProperties}>
      {/* A second sheet under the card, offset by a few pixels: paper on paper, told apart by its edge, not a shadow. */}
      <span className="st-paper-item__sheet" aria-hidden="true" />
      <article className="st-paper-card">
        {/* The picture is the design system's own: a sticker of what the paper is about, bleeding off a light wash. */}
        <div className={`ml-canvas ml-canvas--${thumbnail.field} st-paper-card__thumb`} aria-hidden="true">
          <span className="metadata st-paper-card__number">Paper {pad(index + 1)}</span>
          <Sticker className="ml-sticker--lg st-paper-card__sticker" />
        </div>
        <div className="st-paper-card__body">
          <p className="small pf-ink-secondary">
            {paper.authors} ({paper.year})
          </p>
          <h3 className="st-paper-card__title">{paper.title}</h3>
          <p className="metadata pf-ink-secondary">
            {paper.venue}
            {paper.pages ? ` / ${paper.pages}` : ""}
          </p>
          {paper.note && <p className="small">{paper.note}</p>}
          <div className="st-paper-card__foot">
            {(paper.doi || paper.url) && (
              <a
                className="small"
                href={paper.doi ? `https://doi.org/${paper.doi}` : paper.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {paper.doi ? "Read on doi.org" : "Read the paper"}
                <ArrowIcon size={14} className="pf-icon--out" />
                <span className="pf-visually-hidden">, opens in a new tab</span>
              </a>
            )}
            {paper.openAccess && <span className="ml-tag">Open access</span>}
            <button type="button" className="ml-btn ml-btn--ghost st-paper-card__cite" onClick={copy}>
              {copied === "copied" ? "Citation copied" : "Copy citation"}
            </button>
            <span className="pf-visually-hidden" role="status">
              {copied === "copied" ? "Citation copied to the clipboard" : ""}
            </span>
          </div>
          {copied === "shown" && (
            <p className="small st-paper-card__citation">
              This browser would not copy it, so here it is to select: <span>{citationText(paper)}</span>
            </p>
          )}
        </div>
      </article>
    </li>
  );
}
