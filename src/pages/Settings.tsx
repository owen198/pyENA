import { useId, useState, type FormEvent } from "react";
import type { ThemeMode } from "../../shared/api";
import { api, ApiError } from "../api/client";
import { AppNav } from "../components/Chrome";
import { navigate } from "../router";
import { useSession } from "../state/session";
import { THEME_LABEL, useTheme } from "../theme/theme";
import { CheckIcon, ComputerIcon, MoonIcon, SunIcon } from "../ui/marks";
import { FlagNote } from "../ui/primitives";

const THEMES: { mode: ThemeMode; icon: typeof SunIcon; text: string }[] = [
  { mode: "light", icon: SunIcon, text: "The paper theme the design system is drawn in." },
  { mode: "dark", icon: MoonIcon, text: "Ink ground and paper text. Figures stay on paper so they print as they look." },
  { mode: "system", icon: ComputerIcon, text: "Light or dark as your computer is, switching when it does, without asking." },
];

export function Settings() {
  const user = useSession((state) => state.user)!;
  const logout = useSession((state) => state.logout);
  const mode = useTheme((state) => state.mode) ?? "light";
  const os = useTheme((state) => state.os);
  const choose = useTheme((state) => state.choose);
  const titleId = useId();

  return (
    <div className="pf-page">
      <AppNav />
      <main className="pf-page__main pf-settings" aria-labelledby={titleId}>
        <header className="pf-page__head">
          <div>
            <p className="metadata pf-ink-secondary">Account / {user.username}</p>
            <h1 className="pf-page__title" id={titleId}>
              Settings
            </h1>
          </div>
        </header>

        <section className="pf-settings__section" aria-labelledby="settings-appearance">
          <h2 className="pf-settings__title" id="settings-appearance">
            Appearance
          </h2>
          <div className="pf-choices" role="radiogroup" aria-labelledby="settings-appearance">
            {THEMES.map(({ mode: option, icon: Icon, text }) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                aria-label={THEME_LABEL[option]}
                className="pf-choice"
                onClick={() => choose(option)}
              >
                <span className="pf-choice__head">
                  <Icon size={20} />
                  <span className="label">{THEME_LABEL[option]}</span>
                  {mode === option && <CheckIcon size={18} className="pf-choice__check" />}
                </span>
                <span className="small pf-note">
                  {text}
                  {option === "system" && ` Your computer is ${os} now.`}
                </span>
              </button>
            ))}
          </div>
          <p className="small pf-note">
            With Light or Dark chosen, IdeaLens asks before switching when your computer changes between light and dark.
            The choice is saved to your account and follows you to other computers.
          </p>
        </section>

        <section className="pf-settings__section" aria-labelledby="settings-account">
          <h2 className="pf-settings__title" id="settings-account">
            Account
          </h2>
          <p className="small">
            Signed in as <span className="label">{user.username}</span>.
          </p>
          <NewsSetting />
          <PasswordForm />
          <div>
            <button type="button" className="ml-btn ml-btn--secondary" onClick={() => void logout().then(() => navigate("/"))}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

/** Product news: who IdeaLens may write to, and how to stop it. */
function NewsSetting() {
  const news = useSession((state) => state.user?.news ?? null);
  const askNews = useSession((state) => state.askNews);
  const withdrawNews = useSession((state) => state.withdrawNews);
  const [busy, setBusy] = useState(false);
  return (
    <div className="pf-form">
      <h3 className="label">News from the team</h3>
      {news ? (
        <>
          <p className="small">
            You agreed to news about IdeaLens at <span className="label">{news.email}</span>.
          </p>
          <div>
            <button
              type="button"
              className="ml-btn ml-btn--secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void withdrawNews().finally(() => setBusy(false));
              }}
            >
              Withdraw my consent
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small pf-note">Not connected. IdeaLens asks when you sign in, until you agree.</p>
          <div>
            <button type="button" className="ml-btn ml-btn--secondary" onClick={askNews}>
              Connect with the team
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ status: "idle" | "saving" | "done" | "error"; message?: string; field?: string }>({
    status: "idle",
  });
  const currentId = useId();
  const nextId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next.length < 8) {
      setState({ status: "error", field: "next", message: "Use at least 8 characters." });
      return;
    }
    setState({ status: "saving" });
    try {
      await api("PUT", "/me/password", { current, next });
      setCurrent("");
      setNext("");
      setState({ status: "done" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof ApiError ? error.message : "The password was not changed.",
        field: error instanceof ApiError ? error.field : undefined,
      });
    }
  };

  const invalid = (field: string) => state.status === "error" && state.field === field;
  return (
    <form className="pf-form" onSubmit={(event) => void submit(event)} noValidate>
      <h3 className="label">Change password</h3>
      <div className={`ml-field${invalid("current") ? " ml-field--invalid" : ""}`}>
        <label htmlFor={currentId}>Current password</label>
        <input
          id={currentId}
          className="ml-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        {invalid("current") && <span className="ml-field-hint">{state.message}</span>}
      </div>
      <div className={`ml-field${invalid("next") ? " ml-field--invalid" : ""}`}>
        <label htmlFor={nextId}>New password</label>
        <input
          id={nextId}
          className="ml-input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <span className="ml-field-hint">{invalid("next") ? state.message : "At least 8 characters."}</span>
      </div>
      {state.status === "error" && !state.field && <FlagNote>{state.message}</FlagNote>}
      {state.status === "done" && (
        <p className="small" role="status">
          The password was changed.
        </p>
      )}
      <div>
        <button type="submit" className="ml-btn ml-btn--primary" disabled={state.status === "saving" || !current || !next}>
          {state.status === "saving" ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
