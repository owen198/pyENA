import { useId, useState, type FormEvent } from "react";
import { create } from "zustand";
import { api, ApiError } from "../../api/client";
import { ConnectArt } from "../../components/ConnectArt";
import { FlagNote } from "../../ui/primitives";

/**
 * The exact words a person agrees to by joining. The server keeps them beside
 * the address (POST /api/updates, source "waitlist"), so what was agreed to can
 * always be shown. Pressing Join the waitlist, beside these words, is the act
 * of agreeing; nothing is kept before it.
 */
export const WAITLIST_TEXT =
  "Join the IdeaLens waitlist: we email you when IdeaLens opens to you, and about nothing else. Leave the list at any time.";

type Status =
  | { status: "idle" | "sending" }
  | { status: "error"; message: string; field?: string }
  | { status: "done"; email: string }
  | { status: "left" };

/** One waitlist for the page: joining near the top shows as joined at the end too. */
const useWaitlist = create<{ state: Status; set(state: Status): void }>((set) => ({
  state: { status: "idle" },
  set: (state) => set({ state }),
}));

async function join(email: string) {
  const { set } = useWaitlist.getState();
  set({ status: "sending" });
  try {
    await api("POST", "/updates", { email, consent: true, consentText: WAITLIST_TEXT, source: "waitlist" });
    set({ status: "done", email: email.trim() });
  } catch (error) {
    set({
      status: "error",
      message: error instanceof ApiError ? error.message : "That did not go through. Try again.",
      field: error instanceof ApiError ? error.field : undefined,
    });
  }
}

async function leave(email: string) {
  await api("DELETE", "/updates", { email }).catch(() => undefined);
  useWaitlist.getState().set({ status: "left" });
}

/** The form itself: an address and one button, or the joined state. */
function WaitlistForm({ tone }: { tone: "canvas" | "paper" }) {
  const state = useWaitlist((store) => store.state);
  const [email, setEmail] = useState("");
  const emailId = useId();
  const hintId = useId();
  const onCanvas = tone === "canvas";

  if (state.status === "done") {
    return (
      <div className={`st-wait st-wait--done${onCanvas ? " st-wait--canvas" : ""}`} role="status">
        <p className={onCanvas ? "body-lg" : "body"}>
          You are on the list. We will write to <span className="label">{state.email}</span> when IdeaLens opens to you.
        </p>
        <button type="button" className={`ml-btn ${onCanvas ? "ml-btn--onCanvas" : "ml-btn--ghost"}`} onClick={() => void leave(state.email)}>
          Leave the list
        </button>
      </div>
    );
  }

  const invalid = state.status === "error" && state.field === "email";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) void join(email);
  };

  return (
    <form className={`st-wait${onCanvas ? " st-wait--canvas" : ""}`} onSubmit={submit} noValidate>
      <div className={`ml-field st-wait__field${invalid ? " ml-field--invalid" : ""}`}>
        <label htmlFor={emailId} className={onCanvas ? "pf-visually-hidden" : undefined}>
          Email
        </label>
        <div className="st-wait__row">
          <input
            id={emailId}
            className="ml-input st-wait__input"
            type="email"
            autoComplete="email"
            placeholder={onCanvas ? "Your email address" : undefined}
            value={email}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? hintId : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            type="submit"
            className={`ml-btn ${onCanvas ? "ml-btn--ink" : "ml-btn--primary"}`}
            disabled={state.status === "sending" || !email.trim()}
          >
            {state.status === "sending" ? "Joining…" : "Join the waitlist"}
          </button>
        </div>
        {invalid && (
          <span className="ml-field-hint st-wait__hint" id={hintId}>
            {state.message}
          </span>
        )}
      </div>
      {state.status === "error" && !invalid && <FlagNote>{state.message}</FlagNote>}
      {state.status === "left" && (
        <p className="small" role="status">
          You have left the list; we will not write to you.
        </p>
      )}
      <p className="small st-wait__terms">{WAITLIST_TEXT}</p>
    </form>
  );
}

/** Near the top: on the hero's deep canvas, under the statement. */
export function HeroWaitlist() {
  return <WaitlistForm tone="canvas" />;
}

/** At the end: the team connecting to "you", and the same list. */
export function WaitlistSection() {
  const joined = useWaitlist((store) => store.state.status === "done");
  const titleId = useId();
  return (
    <section className="ml-canvas ml-canvas--blue st-section st-connect" id="waitlist" aria-labelledby={titleId}>
      <div className="st-connect__inner">
        <figure className="st-connect__art">
          <ConnectArt connected={joined} label="The IdeaLens team, connecting to you" />
          <figcaption className="st-connect__names">
            <span className="small">The IdeaLens team</span>
            <span className="small">You</span>
          </figcaption>
        </figure>
        <div className="st-connect__form">
          <p className="metadata pf-ink-secondary">Waitlist</p>
          <h2 className="st-h2" id={titleId}>
            IdeaLens
          </h2>
          <p className="st-wait__line">See how ideas connect.</p>
          <p className="body st-wait__lead">
            IdeaLens opens to researchers in turn. Leave your address and we will write when it is your turn.
          </p>
          <WaitlistForm tone="paper" />
        </div>
      </div>
    </section>
  );
}
