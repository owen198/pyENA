import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { Link, navigate, useLocation } from "../router";
import { useSession } from "../state/session";
import { useScheme } from "../theme/theme";
import { ThemeMenu } from "../components/Chrome";
import { ArrowIcon, Logo } from "../ui/marks";
import { FlagNote } from "../ui/primitives";
import { NetworkBloomSticker, NodeClusterSticker } from "../ui/stickers";

/** Only paths inside this site: never an address another site could supply. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/projects";
}

export function Auth({ mode }: { mode: "login" | "signup" }) {
  const { search } = useLocation();
  const next = safeNext(search.get("next"));
  const status = useSession((state) => state.status);
  const signupOpen = useSession((state) => state.signupOpen);
  const expired = useSession((state) => state.expired);
  const login = useSession((state) => state.login);
  const register = useSession((state) => state.register);
  const scheme = useScheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const userId = useId();
  const passwordId = useId();
  const titleId = useId();
  const signup = mode === "signup";

  // Signed in already: straight on to where they were going.
  useEffect(() => {
    if (status === "signedIn") navigate(next, { replace: true });
  }, [status, next]);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (signup && password.length < 8) {
      setError({ field: "password", message: "Use at least 8 characters for the password." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (signup) await register(username, password);
      else await login(username, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? { message: caught.message, field: caught.field }
          : { message: "That did not work. Try again." },
      );
      setBusy(false);
    }
  };

  const invalid = (field: string) => error?.field === field;
  const other = `${signup ? "/login" : "/signup"}${next !== "/projects" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="ml-canvas ml-canvas--brand ml-canvas--grid st-auth" data-theme="paper">
      <NetworkBloomSticker onBrand className="ml-sticker--xl st-auth__bloom" />
      <NodeClusterSticker className="ml-sticker--lg st-auth__cluster" />
      <header className="st-auth__bar" data-theme={scheme === "dark" ? "dark" : "paper"}>
        <Link className="ml-nav__mark" to="/" aria-label="IdeaLens, overview">
          <Logo size={28} />
          IdeaLens
        </Link>
        <span className="st-auth__bar-end">
          <ThemeMenu />
          <Link to="/" className="ml-btn ml-btn--ghost">
            <ArrowIcon size={16} className="pf-icon--back" />
            Overview
          </Link>
        </span>
      </header>

      <main className="st-auth__panel" data-theme={scheme === "dark" ? "dark" : "paper"} aria-labelledby={titleId}>
        <h1 className="st-auth__title" id={titleId}>
          {signup ? "Create an account" : "Sign in"}
        </h1>
        <p className="small pf-note">
          {signup
            ? "An account keeps your analyses: each dataset, coding schema, settings, figures and results, to reopen later."
            : "Sign in to open your analyses."}
        </p>

        {expired && !signup && <FlagNote>Your session ended. Sign in again to carry on; your saved work is kept.</FlagNote>}

        {signup && !signupOpen ? (
          <FlagNote>New accounts are not open on this server. Ask the person who runs it for an account.</FlagNote>
        ) : (
          <form className="pf-form" onSubmit={(event) => void submit(event)} noValidate>
            <div className={`ml-field${invalid("username") ? " ml-field--invalid" : ""}`}>
              <label htmlFor={userId}>Username</label>
              <input
                id={userId}
                className="ml-input"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              {(signup || invalid("username")) && (
                <span className="ml-field-hint">
                  {invalid("username")
                    ? error!.message
                    : "3 to 32 characters: letters, numbers, dots, dashes or underscores."}
                </span>
              )}
            </div>
            <div className={`ml-field${invalid("password") ? " ml-field--invalid" : ""}`}>
              <label htmlFor={passwordId}>Password</label>
              <input
                id={passwordId}
                className="ml-input"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {(signup || invalid("password")) && (
                <span className="ml-field-hint">{invalid("password") ? error!.message : "At least 8 characters."}</span>
              )}
            </div>
            {error && !error.field && <FlagNote>{error.message}</FlagNote>}
            <button type="submit" className="ml-btn ml-btn--primary pf-btn--block" disabled={busy || !username || !password}>
              {busy ? (signup ? "Creating the account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
            </button>
          </form>
        )}

        <p className="small st-auth__switch">
          {signup ? "Have an account already? " : "New to the platform? "}
          <Link to={other}>{signup ? "Sign in" : "Create an account"}</Link>
        </p>
      </main>
    </div>
  );
}
