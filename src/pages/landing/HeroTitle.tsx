import { useEffect, useState, type CSSProperties } from "react";

/**
 * The hero statement, "See how ideas connect.", arrives once: it is typed out
 * letter by letter behind a single caret, and its last word then flips through
 * meet, link and relate to land on connect, each word a step closer
 * (src/styles/site.css, Hero). It plays once and rests. Under reduced motion
 * the sentence is simply there, ending on "connect".
 *
 * Assistive technology reads the real sentence; the typed copy is hidden from it.
 */
const LEAD = ["See", "how", "ideas"];
/** The last word, in the order it flips. The first is typed in; the last is the one it rests on. */
const FLIP = ["meet", "link", "relate", "connect"];
const SENTENCE = "See how ideas connect.";

const START = 450; // ms before the first letter
const PER_LETTER = 55; // ms per letter; a space is a beat of its own
const PAUSE = 450; // ms between the last letter and the first flip

/** The typed text as beats: a letter, or a space (null). The first flip word and its period are typed too. */
const BEATS: (string | null)[] = [...LEAD.join(" "), " ", ...`${FLIP[0]}.`].map((ch) => (ch === " " ? null : ch));

/**
 * How far typing has got (in beats), and whether the flip has begun. One timer
 * drives both, so the flip always starts a pause after the last letter, however
 * busy the page was while loading.
 */
function useTyping() {
  const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [beats, setBeats] = useState(calm ? BEATS.length : 0);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (calm) return;
    let frame = 0;
    let flipTimer = 0;
    const origin = performance.now() + START;
    const tick = (now: number) => {
      const reached = Math.min(BEATS.length, Math.max(0, Math.floor((now - origin) / PER_LETTER) + 1));
      setBeats(reached);
      if (reached < BEATS.length) frame = requestAnimationFrame(tick);
      else flipTimer = window.setTimeout(() => setFlipping(true), PAUSE);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(flipTimer);
    };
  }, [calm]);
  return { beats, flipping, calm };
}

export function HeroTitle() {
  const { beats, flipping, calm } = useTyping();
  // The caret sits after the latest letter typed, and goes when the flip begins.
  let caretAfter = -1;
  BEATS.forEach((ch, index) => {
    if (ch !== null && index < beats) caretAfter = index;
  });

  let at = 0; // the position in BEATS
  const letters = (text: string) =>
    [...text].map((letter, index) => {
      const position = at++;
      return (
        <span key={index} className={`st-type__ch${position < beats ? " is-on" : ""}`}>
          {letter}
          {position === caretAfter && !flipping && !calm && (
            <span className={`st-type__caret${beats === BEATS.length ? " is-resting" : ""}`} />
          )}
        </span>
      );
    });

  const lead = LEAD.map((word) => {
    const node = (
      <span key={word} className="st-type__word">
        {letters(word)}
      </span>
    );
    at += 1; // the space after it
    return [node, " "];
  });
  // "meet." is typed; the period belongs to every word so the slot never leaves a gap before it.
  const typed = letters(`${FLIP[0]}.`);

  return (
    <>
      <span className="pf-visually-hidden">{SENTENCE}</span>
      <span className={`st-type${flipping ? " is-flipping" : ""}`} aria-hidden="true">
        {lead}
        <span className="st-flip">
          <span className="st-flip__word st-flip__word--typed st-type__word">{typed}</span>
          {FLIP.slice(1).map((word, index) => (
            <span
              key={word}
              className={`st-flip__word ${index === FLIP.length - 2 ? "st-flip__word--final" : "st-flip__word--mid"}`}
              style={{ "--k": index + 1 } as CSSProperties}
            >
              {word}.
            </span>
          ))}
        </span>
      </span>
    </>
  );
}
