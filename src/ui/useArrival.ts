import { useEffect, useRef, useState } from "react";

type ArrivalState = "" | " is-waiting" | " is-in" | " is-in is-from-above";

const motionAllowed = () =>
  typeof window !== "undefined" &&
  typeof IntersectionObserver !== "undefined" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The element arrives every time it comes into view, scrolling down or up:
 * once it has left the screen entirely it resets, and it arrives again from
 * the side it is entered from. Append `state` to its className. Until the
 * page's script has run it is simply shown (no class at all); under reduced
 * motion, or without IntersectionObserver, it stays at rest.
 *
 * By default an element already on screen at load (a reload part-way down the
 * page) is shown as it is and arrives on the next visit. With `playOnLoad` it
 * waits and arrives at once instead, for a page whose content is the point.
 */
export function useArrival<T extends HTMLElement = HTMLElement>({ playOnLoad = false }: { playOnLoad?: boolean } = {}) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<ArrivalState>(playOnLoad && motionAllowed() ? " is-waiting" : "");
  useEffect(() => {
    const element = ref.current;
    if (!element || !motionAllowed()) return;
    if (!playOnLoad) {
      const box = element.getBoundingClientRect();
      if (!(box.top < window.innerHeight && box.bottom > 0)) setState(" is-waiting");
    }

    // In: well inside the window, from below (scrolling down) or from above (scrolling up).
    const enter = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const fromAbove = entry.boundingClientRect.top < 0;
          setState((current) => (current === " is-waiting" ? (fromAbove ? " is-in is-from-above" : " is-in") : current));
        }
      },
      { rootMargin: "-18% 0px -18% 0px" },
    );
    // Out: no longer on screen at all, so the next visit plays it again.
    const leave = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) setState(" is-waiting");
    });
    enter.observe(element);
    leave.observe(element);
    return () => {
      enter.disconnect();
      leave.disconnect();
    };
  }, [playOnLoad]);
  return { ref, state };
}
