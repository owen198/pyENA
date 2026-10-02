import { useId } from "react";
import { Link, navigate } from "../../router";
import { setHandoff } from "../../state/handoff";
import { useSession } from "../../state/session";
import { ArrowIcon } from "../../ui/marks";
import { CodedTalkSticker, ProjectedPointsSticker } from "../../ui/stickers";

/**
 * The way in: the design system's split hero on the blue wash (Hero README),
 * without the live plot grid, kept light in the dark theme too. The coded-talk
 * bubbles breathe in turn, like two people talking; they sit in their own
 * column, so they never cover the text.
 */
export function StartCta() {
  const status = useSession((state) => state.status);
  const titleId = useId();
  const signedIn = status === "signedIn";

  const tryExample = () => {
    setHandoff({ name: "RS.data, design team talk", file: null, sampleId: "rs" });
    navigate(signedIn ? "/start" : "/signup?next=/start");
  };

  return (
    <section className="st-section st-cta" id="start" aria-labelledby={titleId}>
      {/* The light blue wash in either theme, as asked: the paper theme's tokens. */}
      <div className="ml-canvas ml-canvas--blue st-cta__panel" data-theme="paper">
        <div className="st-cta__text">
          <span className="ml-badge">
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <circle cx="10" cy="10" r="5" fill="var(--brand)" />
            </svg>
            Your own research
          </span>
          <h2 className="st-cta__title" id={titleId}>
            Bring your research in
          </h2>
          <p className="body-lg st-cta__sub">
            Name it, add the coded data it comes from, and take it through the same five steps. Everything the analysis
            finds stays with it.
          </p>
          <div className="st-cta__actions">
            <Link to={signedIn ? "/projects" : "/signup"} className="ml-btn ml-btn--primary">
              {signedIn ? "Open the platform" : "Start an analysis"}
            </Link>
            <button type="button" className="ml-btn ml-btn--ghost" onClick={tryExample}>
              Or try it on RS.data
              <ArrowIcon size={16} />
            </button>
          </div>
        </div>
        <div className="st-cta__art">
          <CodedTalkSticker breathe className="ml-sticker--lg st-cta__talk" />
          <ProjectedPointsSticker className="ml-sticker--md st-cta__points" />
        </div>
      </div>
    </section>
  );
}
