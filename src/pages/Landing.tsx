import { useEffect } from "react";
import { FindingSticker, NetworkBloomSticker, NodeClusterSticker } from "../ui/stickers";
import { HeroTitle } from "./landing/HeroTitle";
import { HistoryDemo } from "./landing/HistoryDemo";
import { Research } from "./landing/Research";
import { Showcase } from "./landing/Showcase";
import { HeroWaitlist, WaitlistSection } from "./landing/Waitlist";
import { scrollToSection, SiteFooter, SiteNav } from "./Site";

/**
 * The IdeaLens landing page says one thing, See how ideas connect, and shows
 * it: one real network carried by the scroll from separate ideas to
 * connections, to 2D, into depth, to an interpretation beside single
 * connections (Showcase). Then the way in (Research), the analyses that stay
 * (History) and the waitlist, which also sits under the hero. Every number on
 * it is pyENA's own, from RS.data (src/content/demo-rs.json, demo-depth.json).
 */
export function Landing() {
  // Arriving at /#history (from another page) lands on that section.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);

  return (
    <div className="st-page">
      <a className="pf-skip" href="#showcase">
        Skip to how it works
      </a>
      <SiteNav />

      <main>
        {/* The hero keeps the paper theme in both themes: its field is already the deep brand blue. */}
        <section className="ml-canvas ml-canvas--brand ml-canvas--grid st-hero" data-theme="paper" id="top" aria-labelledby="hero-title">
          <NetworkBloomSticker onBrand className="ml-sticker--xl st-hero__bloom" />
          <NodeClusterSticker className="ml-sticker--lg st-hero__cluster" />
          <FindingSticker className="ml-sticker--sm st-hero__finding" />
          <div className="ml-hero st-hero__body">
            <h1 className="ml-hero__title st-hero__title" id="hero-title">
              <HeroTitle />
            </h1>
            <p className="ml-hero__sub">
              Bring in coded research and watch its ideas connect: a network you can read in 2D, turn in depth, and have
              explained one connection at a time.
            </p>
            <HeroWaitlist />
            <p className="st-hero__more small">
              <a
                href="#showcase"
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection("showcase");
                }}
              >
                See how it works
              </a>
            </p>
          </div>
        </section>

        <Showcase />
        <Research />
        <HistoryDemo />
        <WaitlistSection />
      </main>

      <SiteFooter />
    </div>
  );
}
