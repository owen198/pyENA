// The canvas register's frame: the floating navigation that tightens on
// scroll, the footer, and the Team and Papers pages it links to.

import { useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";
import { OUR_PAPERS, type Paper } from "../content/site";
import { PYENA_COMMIT } from "../engine/version";
import { Link, navigate, useLocation } from "../router";
import { useSession } from "../state/session";
import { DemoTag, LibraryLink, ThemeMenu } from "../components/Chrome";
import { ArrowIcon, Logo } from "../ui/marks";
import { NodeClusterSticker } from "../ui/stickers";
import { OurPeople } from "./OurPeople";

/** Sections of the landing page, in the order the page tells its story. */
export const LANDING_SECTIONS = [
  { id: "showcase", label: "How it works" },
  { id: "research", label: "Your research" },
  { id: "history", label: "History" },
  { id: "waitlist", label: "Waitlist" },
] as const;

const PAGES = [
  { to: "/team", label: "Team" },
  { to: "/papers", label: "Papers" },
] as const;

export function scrollToSection(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  history.replaceState(null, "", `/#${id}`);
}

/** Compact once the page scrolls; on the landing page, which section is in view. */
function useScrollState(watch: boolean): { compact: boolean; active: string | null } {
  const [state, setState] = useState<{ compact: boolean; active: string | null }>({ compact: false, active: null });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = Math.min(160, window.innerHeight * 0.3);
      let active: string | null = null;
      if (watch) {
        for (const section of LANDING_SECTIONS) {
          const top = document.getElementById(section.id)?.getBoundingClientRect().top;
          if (top !== undefined && top <= line) active = section.id;
        }
      }
      const compact = window.scrollY > 24;
      setState((previous) => (previous.compact === compact && previous.active === active ? previous : { compact, active }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [watch]);
  return state;
}

export function SiteNav() {
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  const { compact, active } = useScrollState(onLanding);
  const status = useSession((state) => state.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const goSection = (event: MouseEvent, id: string) => {
    setMenuOpen(false);
    if (!onLanding) return; // an ordinary link to /#id
    event.preventDefault();
    scrollToSection(id);
  };
  const links = (
    <>
      {LANDING_SECTIONS.map((section) => (
        <li key={section.id}>
          <a
            href={`/#${section.id}`}
            aria-current={onLanding && active === section.id ? "true" : undefined}
            onClick={(event) => {
              if (!onLanding) {
                event.preventDefault();
                setMenuOpen(false);
                navigate(`/#${section.id}`);
                return;
              }
              goSection(event, section.id);
            }}
          >
            {section.label}
          </a>
        </li>
      ))}
      {PAGES.map((page) => (
        <li key={page.to}>
          <Link to={page.to} aria-current={pathname === page.to ? "page" : undefined} onClick={() => setMenuOpen(false)}>
            {page.label}
          </Link>
        </li>
      ))}
    </>
  );
  const account =
    status === "signedIn" ? (
      <Link to="/projects" className="ml-btn ml-btn--primary">
        Open your analyses
      </Link>
    ) : (
      <>
        <Link to="/login" className="ml-btn ml-btn--ghost st-nav__signin">
          Sign in
        </Link>
        <Link to="/signup" className="ml-btn ml-btn--primary">
          Start an analysis
        </Link>
      </>
    );

  return (
    <header className={`st-nav${compact ? " is-compact" : ""}`}>
      <nav className="st-nav__bar" aria-label="Primary">
        <span className="pf-brand">
          <Link className="ml-nav__mark" to="/" aria-label="IdeaLens, home">
            <Logo size={28} />
            IdeaLens
          </Link>
          <DemoTag />
        </span>
        <ul className="ml-nav__links st-nav__links">{links}</ul>
        <span className="st-nav__end">
          <ThemeMenu />
          <span className="st-nav__account">{account}</span>
          <button
            type="button"
            className="ml-btn ml-btn--ghost st-nav__menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Menu
          </button>
        </span>
      </nav>
      {menuOpen && (
        <div className="st-nav__panel" id={menuId}>
          <ul className="st-nav__panel-links">{links}</ul>
          <div className="st-nav__panel-account">{account}</div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const status = useSession((state) => state.status);
  return (
    <footer className="st-footer">
      <div className="st-footer__brand">
        <span className="ml-nav__mark">
          <Logo size={28} />
          IdeaLens
        </span>
        <p className="st-footer__line">See how ideas connect.</p>
        <p className="small pf-note">
          A demonstration of IdeaLens. Analyses run on the pyENA library at commit {PYENA_COMMIT.slice(0, 7)}, in your
          browser.
        </p>
      </div>
      <ul className="st-footer__links">
        {LANDING_SECTIONS.map((section) => (
          <li key={section.id}>
            <Link to={`/#${section.id}`}>{section.label}</Link>
          </li>
        ))}
        {PAGES.map((page) => (
          <li key={page.to}>
            <Link to={page.to}>{page.label}</Link>
          </li>
        ))}
        <li>
          <LibraryLink />
        </li>
        <li>{status === "signedIn" ? <Link to="/projects">Your analyses</Link> : <Link to="/login">Sign in</Link>}</li>
      </ul>
      <ul className="st-footer__legal" aria-label="Legal">
        <li>
          <Link to="/privacy">Privacy Policy</Link>
        </li>
        <li>
          <Link to="/terms">Terms of Service</Link>
        </li>
      </ul>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Team and Papers
// ---------------------------------------------------------------------------

/** A page of the canvas register: a light wash heading, then the content on paper. */
export function SitePage({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: ReactNode }) {
  const titleId = useId();
  // A statement, not an expression: scrollTo returns a Promise in newer browsers,
  // and an effect may only return a clean-up function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <div className="st-page">
      <a className="pf-skip" href="#content">
        Skip to the content
      </a>
      <SiteNav />
      <main aria-labelledby={titleId}>
        <header className="ml-canvas ml-canvas--blue st-pagehead">
          <NodeClusterSticker className="ml-sticker--lg st-pagehead__sticker" />
          <div className="st-block">
            <p className="metadata pf-ink-secondary">{eyebrow}</p>
            <h1 className="st-pagehead__title" id={titleId}>
              {title}
            </h1>
            <p className="body-lg st-lead">{lead}</p>
          </div>
        </header>
        <section className="st-section" id="content">
          <div className="st-block">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function TeamPage() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <div className="st-page">
      <a className="pf-skip" href="#after-people">
        Skip past the team
      </a>
      <SiteNav />
      <main>
        <OurPeople />
        <section className="st-section st-after-people" id="after-people">
          <div className="st-block">
            <p className="small st-credit">
              The analysis itself is the pyENA library by owen198, run unchanged at commit {PYENA_COMMIT.slice(0, 7)}.{" "}
              <LibraryLink>See the library</LibraryLink>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function PapersPage() {
  return (
    <SitePage
      eyebrow="Papers"
      title="Papers"
      lead="Papers by the IdeaLens team."
    >
      <div className="st-papers">
        <h2 className="st-h3">Our papers</h2>
        <ol className="st-paper-list">
          {OUR_PAPERS.map((paper) => (
            <PaperEntry key={paper.title} paper={paper} />
          ))}
        </ol>
      </div>
    </SitePage>
  );
}

function PaperEntry({ paper }: { paper: Paper }) {
  return (
    <li className="st-paper">
      <span className="small">
        {paper.authors} ({paper.year})
      </span>
      <p className="st-paper__title">{paper.title}</p>
      <span className="metadata pf-ink-secondary">
        {paper.venue}
        {paper.pages ? ` / ${paper.pages}` : ""}
      </span>
      {paper.note && <p className="small pf-note">{paper.note}</p>}
      {(paper.doi || paper.url) && (
        <span className="st-paper__links">
          <a
            className="small"
            href={paper.doi ? `https://doi.org/${paper.doi}` : paper.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {paper.doi ? `doi.org/${paper.doi}` : paper.url!.replace(/^https?:\/\//, "")}
            <ArrowIcon size={14} className="pf-icon--out" />
            <span className="pf-visually-hidden">, opens in a new tab</span>
          </a>
          {paper.openAccess && <span className="ml-tag">Open access</span>}
        </span>
      )}
    </li>
  );
}
