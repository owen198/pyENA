// "New: Interpretation", once, for an account that finished the
// tutorial before the feature existed. Show me runs the tutorial again; either
// answer is remembered on the account (PUT /api/me/notices).

import { useId } from "react";
import { useSession } from "../state/session";
import { FIGURE_NOTICE, markNoticeSeen, useTour } from "./state";

const markSeen = () => markNoticeSeen(FIGURE_NOTICE);

export function FeatureNotice() {
  const user = useSession((state) => state.user);
  const phase = useTour((state) => state.phase);
  const titleId = useId();
  if (!user || phase !== "closed" || user.settings.tutorial !== "completed" || user.settings.notices?.includes(FIGURE_NOTICE)) return null;
  return (
    <div className="pf-popover pf-feature-notice" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <h2 className="pf-popover__title" id={titleId}>
        New: Interpretation
      </h2>
      <p className="small">
        Press <b>Interpretation</b> above the results to ask what any connection means, with the lines of data behind
        each answer. Your conversations are kept there too.
      </p>
      <div className="pf-row">
        <button
          type="button"
          className="ml-btn ml-btn--primary"
          onClick={() => {
            markSeen();
            useTour.getState().restart();
          }}
        >
          Show me
        </button>
        <button type="button" className="ml-btn ml-btn--secondary" onClick={markSeen}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
