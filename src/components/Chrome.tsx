// The frame around every page: the Demo tag, the library link (which warns
// before leaving for GitHub), the theme menu and its question, the account
// menu, and the product register's navigation bar.

import { useEffect, useId, useState, type ReactNode } from "react";
import type { PublicUser, ThemeMode } from "../../shared/api";
import { Link, navigate, useLocation } from "../router";
import { useSession } from "../state/session";
import { schemeOf, THEME_LABEL, useScheme, useTheme } from "../theme/theme";
import { ArrowIcon, CheckIcon, ComputerIcon, Logo, MoonIcon, SunIcon } from "../ui/marks";
import { Menu, MenuItem } from "../ui/Menu";
import { Modal, Tip } from "../ui/primitives";
import { useTour } from "../tutorial/state";

export const LIBRARY_URL = "https://github.com/owen198/pyENA";
const DEMO_NOTE = "A demonstration of IdeaLens. Analyses run on the real pyENA library, in your browser.";

export function DemoTag() {
  return (
    <Tip text={DEMO_NOTE} align="start">
      <span className="ml-tag ml-tag--brand pf-demo" tabIndex={0} aria-label={`Demo. ${DEMO_NOTE}`}>
        <span className="ml-tag-dot pf-demo__dot" />
        Demo
      </span>
    </Tip>
  );
}

/** A link to the pyENA library that says where it goes before it goes. */
export function LibraryLink({ className, children = "Library" }: { className?: string; children?: ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <a
        href={LIBRARY_URL}
        className={`pf-external${className ? ` ${className}` : ""}`}
        onClick={(event) => {
          event.preventDefault();
          setLeaving(true);
        }}
      >
        {children}
        <ArrowIcon size={14} className="pf-icon--out" />
        <span className="pf-visually-hidden">, opens GitHub</span>
      </a>
      {leaving && (
        <Modal
          title="Leave for GitHub?"
          onClose={() => setLeaving(false)}
          actions={
            <>
              <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setLeaving(false)}>
                Stay here
              </button>
              <button
                type="button"
                className="ml-btn ml-btn--primary"
                onClick={() => {
                  setLeaving(false);
                  window.open(LIBRARY_URL, "_blank", "noopener,noreferrer");
                }}
              >
                Open GitHub
              </button>
            </>
          }
        >
          The pyENA library lives at github.com/owen198/pyENA, a site outside this platform. It opens in a new tab;
          your analyses stay in IdeaLens.
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const THEME_ICON: Record<ThemeMode, typeof SunIcon> = { light: SunIcon, dark: MoonIcon, system: ComputerIcon };

export function ThemeMenu({ triggerClassName = "ml-btn ml-btn--ghost pf-theme-btn" }: { triggerClassName?: string }) {
  const mode = useTheme((state) => state.mode);
  const os = useTheme((state) => state.os);
  const choose = useTheme((state) => state.choose);
  const scheme = useScheme();
  const Current = mode === "system" ? ComputerIcon : scheme === "dark" ? MoonIcon : SunIcon;
  const described = mode === "system" ? `${THEME_LABEL.system} (${os})` : THEME_LABEL[schemeOf(mode, os)];

  return (
    <Menu
      label={`Theme: ${described}`}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Current size={20} />
          <span className="pf-theme-btn__label">Theme</span>
        </>
      }
    >
      {(close) => (
        <>
          {(["light", "dark", "system"] as ThemeMode[]).map((option) => {
            const Icon = THEME_ICON[option];
            const checked = (mode ?? "light") === option;
            return (
              <MenuItem
                key={option}
                checked={checked}
                onSelect={() => {
                  choose(option);
                  close();
                }}
              >
                <Icon size={20} />
                <span className="pf-menu__text">{THEME_LABEL[option]}</span>
                {checked && <CheckIcon size={16} className="pf-menu__check" />}
              </MenuItem>
            );
          })}
          <p className="small pf-note pf-menu__note">
            {mode === "system"
              ? `Following your computer, which is ${os} now.`
              : "When your computer's setting differs, IdeaLens asks before switching."}
          </p>
        </>
      )}
    </Menu>
  );
}

/**
 * The question IdeaLens asks when the computer's light or dark setting differs
 * from its own: on a first visit, or when the computer switches. Nothing
 * changes until the researcher answers.
 */
export function ThemePrompt() {
  const prompt = useTheme((state) => state.prompt);
  const mode = useTheme((state) => state.mode);
  const answer = useTheme((state) => state.answer);
  const dismiss = useTheme((state) => state.dismiss);
  const scheme = useScheme();
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!prompt) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && dismiss();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prompt, dismiss]);

  if (!prompt) return null;
  return (
    <div className="pf-popover pf-theme-prompt" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId}>
      <h2 className="pf-popover__title" id={titleId}>
        {prompt === "dark" ? <MoonIcon size={20} /> : <SunIcon size={20} />}
        {mode === null ? `Your computer is set to ${prompt} mode` : `Your computer switched to ${prompt} mode`}
      </h2>
      <p className="small" id={bodyId}>
        Switch IdeaLens to {prompt} as well? You can change it any time with Theme at the top of the page or in Settings.
      </p>
      <div className="pf-row">
        <button type="button" className="ml-btn ml-btn--primary" onClick={() => answer("switch")}>
          Switch to {prompt}
        </button>
        <button type="button" className="ml-btn ml-btn--secondary" onClick={() => answer("keep")}>
          Keep {scheme}
        </button>
      </div>
      <button type="button" className="ml-btn ml-btn--ghost pf-popover__extra" onClick={() => answer("always")}>
        Always match my computer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account and navigation
// ---------------------------------------------------------------------------

export function AccountMenu({ user }: { user: PublicUser }) {
  const logout = useSession((state) => state.logout);
  return (
    <Menu label={`Account: ${user.username}`} triggerClassName="ml-btn ml-btn--ghost pf-account-btn" trigger={<span className="label">{user.username}</span>}>
      {(close) => (
        <>
          <p className="metadata pf-ink-secondary pf-menu__note">Signed in as {user.username}</p>
          <MenuItem
            onSelect={() => {
              close();
              navigate("/settings");
            }}
          >
            <span className="pf-menu__text">Settings</span>
          </MenuItem>
          <MenuItem
            onSelect={() => {
              close();
              useTour.getState().restart();
            }}
          >
            <span className="pf-menu__text">Take the tutorial</span>
          </MenuItem>
          <MenuItem
            onSelect={() => {
              close();
              void logout().then(() => navigate("/"));
            }}
          >
            <span className="pf-menu__text">Sign out</span>
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

/** The product register's bar: the mark, History, Library, the theme and the account. */
export function AppNav({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const user = useSession((state) => state.user);
  return (
    <nav className="ml-nav pf-nav" aria-label="Primary">
      <span className="pf-brand">
        <Link className="ml-nav__mark" to="/" aria-label="IdeaLens, overview">
          <Logo size={28} />
          IdeaLens
        </Link>
        <DemoTag />
      </span>
      <ul className="ml-nav__links">
        <li>
          <Link to="/projects" aria-current={pathname.startsWith("/projects") ? "page" : undefined}>
            History
          </Link>
        </li>
        <li>
          <LibraryLink />
        </li>
      </ul>
      {children}
      <span className="pf-nav__end">
        <ThemeMenu />
        {user && <AccountMenu user={user} />}
      </span>
    </nav>
  );
}
