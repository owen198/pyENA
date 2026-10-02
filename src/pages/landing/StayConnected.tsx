import { useId, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { ConnectArt } from "../../components/ConnectArt";
import { CONSENT_TEXT } from "../../content/consent";
import { useSession } from "../../state/session";
import { FlagNote } from "../../ui/primitives";

type State =
  | { status: "idle" | "sending" }
  | { status: "error"; message: string; field?: string }
  | { status: "done"; email: string }
  | { status: "withdrawn" };

/**
 * Product news by consent: an address and a box the visitor ticks themselves
 * (never pre-ticked), beside the team connecting to them. Signed in, the
 * consent goes on the account, so pyENA stops asking at sign-in.
 */
export function StayConnected() {
  const user = useSession((session) => session.user);
  const giveNews = useSession((session) => session.giveNews);
  const withdrawNews = useSession((session) => session.withdrawNews);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const titleId = useId();
  const emailId = useId();
  const consentId = useId();
  const hintId = useId();
  const connected = state.status === "done" || Boolean(user?.news);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent) {
      setState({ status: "error", field: "consent", message: "Tick the box to agree, or leave it: nothing is kept without it." });
      return;
    }
    setState({ status: "sending" });
    try {
      if (user) await giveNews(email, CONSENT_TEXT);
      else await api("POST", "/updates", { email, consent: true, consentText: CONSENT_TEXT });
      setState({ status: "done", email: email.trim() });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof ApiError ? error.message : "That did not go through. Try again.",
        field: error instanceof ApiError ? error.field : undefined,
      });
    }
  };

  const withdraw = async () => {
    if (user?.news) await withdrawNews().catch(() => undefined);
    else if (state.status === "done") await api("DELETE", "/updates", { email: state.email }).catch(() => undefined);
    setConsent(false);
    setEmail("");
    setState({ status: "withdrawn" });
  };

  const invalid = (field: string) => state.status === "error" && state.field === field;

  return (
    <section className="ml-canvas ml-canvas--blue st-section st-connect" id="connect" aria-labelledby={titleId}>
      <div className="st-connect__inner">
        <figure className="st-connect__art">
          <ConnectArt connected={connected} />
          <figcaption className="st-connect__names">
            <span className="small">The pyENA team</span>
            <span className="small">You</span>
          </figcaption>
        </figure>

        <div className="st-connect__form">
          <p className="metadata pf-ink-secondary">Stay connected</p>
          <h2 className="st-h2" id={titleId}>
            Hear from the team
          </h2>
          {connected ? (
            <div className="pf-stack" role="status">
              <p className="body">
                You are connected. We will write to {user?.news?.email ?? (state.status === "done" ? state.email : "")} about
                pyENA, and about nothing else.
              </p>
              <div>
                <button type="button" className="ml-btn ml-btn--ghost" onClick={() => void withdraw()}>
                  Withdraw my consent
                </button>
              </div>
            </div>
          ) : (
            <form className="pf-form" onSubmit={(event) => void submit(event)} noValidate>
              <p className="body">
                New features, papers, and word of when the platform opens more widely. Only if you say yes.
              </p>
              {state.status === "withdrawn" && (
                <p className="small" role="status">
                  Your consent is withdrawn; we will not write to you.
                </p>
              )}
              <div className={`ml-field${invalid("email") ? " ml-field--invalid" : ""}`}>
                <label htmlFor={emailId}>Email</label>
                <input
                  id={emailId}
                  className="ml-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-describedby={invalid("email") ? hintId : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {invalid("email") && (
                  <span className="ml-field-hint" id={hintId}>
                    {state.status === "error" && state.message}
                  </span>
                )}
              </div>
              <label className={`st-consent${invalid("consent") ? " is-invalid" : ""}`} htmlFor={consentId}>
                <input
                  id={consentId}
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span className="small">{CONSENT_TEXT}</span>
              </label>
              {state.status === "error" && state.field !== "email" && <FlagNote>{state.message}</FlagNote>}
              <div>
                <button type="submit" className="ml-btn ml-btn--primary" disabled={state.status === "sending" || !email.trim()}>
                  {state.status === "sending" ? "Connecting…" : "Connect"}
                </button>
              </div>
              <p className="small pf-note">
                We keep your address, the words above and when you agreed; nothing else. Withdraw at any time.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
