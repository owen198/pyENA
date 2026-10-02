import { useId, useState } from "react";
import { ApiError } from "../api/client";
import { CONSENT_TEXT } from "../content/consent";
import { useSession } from "../state/session";
import { FlagNote, Modal } from "../ui/primitives";
import { ConnectArt } from "./ConnectArt";

/**
 * Asked at sign-in until the researcher agrees: may the team write to them
 * about IdeaLens? The box is never ticked for them, and "Not now" asks again at
 * the next sign-in, not before.
 */
export function NewsPrompt() {
  const open = useSession((state) => state.newsPrompt);
  const dismiss = useSession((state) => state.dismissNews);
  const giveNews = useSession((state) => state.giveNews);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const emailId = useId();
  const consentId = useId();
  if (!open) return null;

  const connect = async () => {
    if (!consent) {
      setError({ field: "consent", message: "Tick the box to agree, or choose Not now: nothing is kept without it." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await giveNews(email, CONSENT_TEXT);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? { message: caught.message, field: caught.field } : { message: "That did not go through. Try again." },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Stay connected with the team"
      onClose={dismiss}
      actions={
        <>
          <button type="button" className="ml-btn ml-btn--secondary" onClick={dismiss}>
            Not now
          </button>
          <button type="button" className="ml-btn ml-btn--primary" disabled={busy || !email.trim()} onClick={() => void connect()}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </>
      }
    >
      <div className="pf-news">
        <div className="pf-news__art">
          <ConnectArt />
          <div className="st-connect__names">
            <span className="small">The IdeaLens team</span>
            <span className="small">You</span>
          </div>
        </div>
        <p>Hear about new features, papers, and when the platform opens more widely. Only if you say yes.</p>
        <div className={`ml-field${error?.field === "email" ? " ml-field--invalid" : ""}`}>
          <label htmlFor={emailId}>Email</label>
          <input
            id={emailId}
            className="ml-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void connect()}
          />
          {error?.field === "email" && <span className="ml-field-hint">{error.message}</span>}
        </div>
        <label className={`st-consent${error?.field === "consent" ? " is-invalid" : ""}`} htmlFor={consentId}>
          <input id={consentId} type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span className="small">{CONSENT_TEXT}</span>
        </label>
        {error && error.field !== "email" && <FlagNote>{error.message}</FlagNote>}
        <p className="small pf-note">
          We keep your address, the words above and when you agreed; nothing else. Withdraw at any time in Settings.
        </p>
      </div>
    </Modal>
  );
}
