// Our people: the team, introduced one at a time by the scroll.
//
// It opens on the introduction, with everyone's card laid loosely on the paper
// beside it. Scrolling down, the cards come up one by one: the current person's
// card moves to the middle and grows, their name and role come in beside it
// (alternating sides), and the people before and after wait at the edges.
// After the last person the cards gather into one row above "Keep in touch
// with us" and the waitlist, which hold for a moment before the page carries
// on into the next section.
//
// Desktop with motion allowed is the scroll story: the stage pins while the
// track scrolls past, and one scroll handler places every card from the scroll
// position (transform and opacity only). Phones, and reduced motion, get the
// same people in order as plain flow, portrait first and information beneath;
// on phones each person settles in as it scrolls into view.
//
// Everything a person reads is ordinary markup in reading order (a heading,
// then a list of people); the motion only moves it.

import { useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { TEAM } from "../content/site";
import { PeopleWaitlist } from "./landing/Waitlist";
import { pad } from "../steps";
import { ArrowIcon } from "../ui/marks";
import { FindingSticker, NodeClusterSticker } from "../ui/stickers";

const N = TEAM.length;
const STORY = "(min-width: 900px) and (prefers-reduced-motion: no-preference)";
const CALM = "(prefers-reduced-motion: reduce)";

// ---------------------------------------------------------------------------
// Poses: where a card sits, as fractions of the stage (x of its width, y of its
// height, both to the card's centre), with its scale, tilt and opacity.
// ---------------------------------------------------------------------------

interface Pose {
  x: number;
  y: number;
  s: number;
  r: number;
  o: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const v = clamp01(value);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  s: lerp(a.s, b.s, t),
  r: lerp(a.r, b.r, t),
  o: lerp(a.o, b.o, t),
});

/** The opening: the cards laid loosely on the right of the paper, overlapping, none square to the page. */
const SCATTER: Pose[] = [
  { x: 0.64, y: 0.4, s: 0.6, r: -6, o: 1 },
  { x: 0.83, y: 0.32, s: 0.52, r: 5, o: 1 },
  { x: 0.74, y: 0.66, s: 0.62, r: 2.5, o: 1 },
  { x: 0.92, y: 0.62, s: 0.5, r: -4, o: 1 },
  { x: 0.57, y: 0.75, s: 0.48, r: 7, o: 1 },
];
const scatter = (index: number): Pose => {
  const base = SCATTER[index % SCATTER.length];
  const round = Math.floor(index / SCATTER.length); // more people than poses: the next round sits a little lower
  return { ...base, y: base.y + round * 0.06, r: base.r + round * 3 };
};

/** Even people stand right of centre with their words on the left; odd people the other way round. */
const side = (index: number) => (index % 2 === 0 ? 1 : -1);
const focus = (index: number): Pose => ({ x: 0.5 + side(index) * 0.13, y: 0.54, s: 1, r: side(index) * -1.5, o: 1 });
/** Waiting at the right edge, partly off the paper; the further off, the fainter. */
const ahead = (index: number, steps: number): Pose => ({
  x: 1 + (steps - 1) * 0.02,
  y: 0.5 + (steps - 1) * 0.06,
  s: 0.46,
  r: 6 + (index % 3) * 2 - (steps - 1) * 3,
  o: Math.max(0, 0.85 - (steps - 1) * 0.35),
});
/** Gone by, at the left edge, fainter than what is coming. */
const behind = (index: number, steps: number): Pose => ({
  x: 0 - (steps - 1) * 0.02,
  y: 0.5 + (steps - 1) * 0.06,
  s: 0.42,
  r: -6 - (index % 3) * 2 + (steps - 1) * 3,
  o: Math.max(0, 0.6 - (steps - 1) * 0.3),
});
/** In the story, `d` people away from the one in focus (negative: already introduced). */
const inStory = (index: number, d: number): Pose => {
  if (d >= 0) return d <= 1 ? mix(focus(index), ahead(index, 1), d) : ahead(index, d);
  return d >= -1 ? mix(focus(index), behind(index, 1), -d) : behind(index, -d);
};
/** The close: everyone in one row, slightly fanned, above the closing line and the waitlist. */
const together = (index: number): Pose => {
  const offset = index - (N - 1) / 2;
  return { x: 0.5 + offset * 0.105, y: 0.33, s: 0.4, r: offset * 3, o: 1 };
};

/** Steps along the track: the introduction, each person, the close, and a last half step holding the close. */
const STEPS = N + 1.5;
/**
 * Where the story is, from the share of the track scrolled (0 to 1): 0 is the
 * introduction, 1 to N the people in turn, N + 1 the close. Each person holds
 * still for a while either side of their turn, so a turn is a deliberate step
 * rather than a continuous slide; the close holds until the track ends.
 */
const storyAt = (progress: number) => {
  const raw = progress * STEPS;
  if (raw >= N + 1) return N + 1;
  const whole = Math.floor(raw);
  return whole + ease((raw - whole - 0.18) / 0.64);
};
/** The share of the track at which step `step` is settled in place (for moving keyboard focus there). */
const progressOf = (step: number) => Math.min(step, N + 1.2) / STEPS;

// ---------------------------------------------------------------------------

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function OurPeople() {
  const titleId = useId();
  const story = useMedia(STORY);
  const calm = useMedia(CALM);

  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLElement>(null);
  const rail = useRef<HTMLOListElement>(null);
  const stickers = useRef<(HTMLDivElement | null)[]>([]);
  const people = useRef<(HTMLLIElement | null)[]>([]);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const words = useRef<(HTMLDivElement | null)[]>([]);
  const outro = useRef<HTMLDivElement>(null);

  // The scroll story: every frame the page has scrolled, place everything from where the track is.
  useEffect(() => {
    if (!story) return;
    let frame = 0;
    let shown = -1;
    const place = () => {
      frame = 0;
      const box = track.current?.getBoundingClientRect();
      const area = stage.current?.getBoundingClientRect();
      if (!box || !area) return;
      const progress = clamp01(-box.top / Math.max(1, box.height - window.innerHeight));
      const t = storyAt(progress);
      const opening = 1 - clamp01(t); // 1 at the introduction, 0 once the first person is in focus
      const closing = ease(t - N); // 0 until after the last person, 1 at the close

      TEAM.forEach((_, index) => {
        const d = index + 1 - t;
        let pose = mix(inStory(index, d), scatter(index), ease(opening));
        pose = mix(pose, together(index), closing);
        const card = cards.current[index];
        if (card) {
          card.style.transform = `translate(${pose.x * area.width}px, ${pose.y * area.height}px) translate(-50%, -50%) rotate(${pose.r}deg) scale(${pose.s})`;
          card.style.opacity = String(pose.o);
          card.style.zIndex = String(opening > 0.5 ? 10 + index : Math.round(100 - Math.abs(d) * 10));
        }
        // Their words rise in as they come into focus and carry on upward as they leave it.
        // Faded out, they stay in the page for screen readers; only the pointer passes through.
        const said = words.current[index];
        if (said) {
          const o = clamp01(1 - Math.abs(d) * 2.4) * (1 - closing);
          said.style.opacity = String(o);
          said.style.transform = `translateY(${d * 48}px)`;
          said.style.pointerEvents = o > 0.5 ? "auto" : "none";
        }
      });

      if (intro.current) {
        const o = clamp01(1 - t * 1.6);
        intro.current.style.opacity = String(o);
        intro.current.style.transform = `translateX(${-t * 60}px)`;
        intro.current.style.pointerEvents = o > 0.5 ? "auto" : "none";
      }
      // The closing line and the waitlist rise in under the gathered row.
      if (outro.current) {
        outro.current.style.opacity = String(closing);
        outro.current.style.transform = `translateY(${(1 - closing) * 36}px)`;
        outro.current.style.pointerEvents = closing > 0.5 ? "auto" : "none";
      }
      if (rail.current) rail.current.style.opacity = String(1 - closing);
      // The stickers drift a little slower than the cards: paper under the photographs.
      stickers.current.forEach((sticker, index) => {
        if (sticker) sticker.style.translate = `0 ${-(t * (index ? 18 : 28))}px`;
      });
      // The index along the foot marks whose turn it is.
      const now = Math.round(t);
      if (now !== shown && rail.current) {
        shown = now;
        [...rail.current.children].forEach((item, index) => item.classList.toggle("is-current", index + 1 === now));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const cardList = cards.current;
    const wordList = words.current;
    const introNode = intro.current;
    const outroNode = outro.current;
    const stickerList = stickers.current;
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      // Leaving the story (a narrower window, reduced motion turned on): back to plain flow.
      for (const node of [...cardList, ...wordList, introNode, outroNode]) node?.removeAttribute("style");
      for (const node of stickerList) node?.style.removeProperty("translate");
    };
  }, [story]);

  // Phones: each person settles in as they scroll into view. Reduced motion: they are simply there.
  const [arrived, setArrived] = useState<boolean[]>(() => TEAM.map(() => false));
  useEffect(() => {
    if (story || calm || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = people.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setArrived((current) => (current[index] ? current : current.map((value, i) => value || i === index)));
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const person of people.current) if (person) observer.observe(person);
    return () => observer.disconnect();
  }, [story, calm]);
  const revealing = !story && !calm;

  // In the story, moving keyboard focus into a person's words or the waitlist scrolls to their turn, so what has focus is on screen.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!story || !track.current) return;
    const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-step]");
    if (!holder) return;
    const box = track.current.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    window.scrollTo({ top: window.scrollY + box.top + progressOf(Number(holder.dataset.step)) * travel, behavior: "instant" });
  };

  return (
    <section
      className={`op${story ? " is-story" : ""}${revealing ? " is-revealing" : ""}`}
      aria-labelledby={titleId}
      style={{ "--n": N } as CSSProperties}
    >
      <div className="op__track" ref={track}>
        <div className="op__stage ml-canvas ml-canvas--paper ml-canvas--grid" data-theme="paper" ref={stage} onFocus={onFocus}>
          <div className="op__sticker op__sticker--finding" ref={(node) => void (stickers.current[0] = node)} aria-hidden="true">
            <FindingSticker className="ml-sticker--sm" />
          </div>
          <div className="op__sticker op__sticker--cluster" ref={(node) => void (stickers.current[1] = node)} aria-hidden="true">
            <NodeClusterSticker className="ml-sticker--lg" />
          </div>

          <header className="op__intro" ref={intro}>
            <p className="metadata op__eyebrow">
              National Chengchi University <span aria-hidden="true">·</span> Taiwan
            </p>
            <h1 className="op__title" id={titleId}>
              OUR PEOPLE
            </h1>
            <p className="body-lg op__lead">
              Students, researchers and builders from NCCU, each bringing a different way of looking at one question:
              how ideas connect.
            </p>
            <p className="metadata op__count">
              {pad(N)} people{story && <span className="op__hint"> · scroll to meet them</span>}
            </p>
          </header>

          <ol className="op__people" aria-label="The team">
            {TEAM.map((member, index) => (
              <li
                key={index}
                className={`op__person op__person--${index % 2 === 0 ? "right" : "left"}${arrived[index] ? " is-in" : ""}`}
                ref={(node) => void (people.current[index] = node)}
                style={{ "--i": index } as CSSProperties}
              >
                <figure className="op__card" ref={(node) => void (cards.current[index] = node)}>
                  <span className="metadata op__card-index">{pad(index + 1)}</span>
                  {member.photo && (
                    <img
                      className="op__photo"
                      src={member.photo}
                      alt={member.name ? `Portrait of ${member.name}` : ""}
                      width={600}
                      height={750}
                      loading={index < 2 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  )}
                  <figcaption className="op__card-name" aria-hidden="true">
                    {member.name}
                  </figcaption>
                </figure>
                <div className="op__words" ref={(node) => void (words.current[index] = node)} data-step={index + 1}>
                  <p className="metadata op__of">
                    {pad(index + 1)} <span aria-hidden="true">/</span> {pad(N)}
                  </p>
                  <h2 className="op__name">{member.name ?? "To be added"}</h2>
                  <p className="body-lg op__role">{member.role ?? "Role to be added"}</p>
                  {member.bio && <p className="body op__bio">{member.bio}</p>}
                  {member.affiliation && (
                    <p className="small op__where">
                      <span className="op__mark" aria-hidden="true" />
                      {member.affiliation}, Taiwan
                    </p>
                  )}
                  {member.url && (
                    <a className="small op__link" href={member.url} target="_blank" rel="noopener noreferrer">
                      Profile
                      <ArrowIcon size={14} className="pf-icon--out" />
                      <span className="pf-visually-hidden">, opens in a new tab</span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="op__outro" ref={outro} data-step={N + 1}>
            <h2 className="op__outro-title">Keep in touch with us</h2>
            <PeopleWaitlist />
          </div>

          {story && (
            <ol className="op__rail" ref={rail} aria-hidden="true">
              {TEAM.map((_, index) => (
                <li key={index} className="metadata">
                  {pad(index + 1)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
