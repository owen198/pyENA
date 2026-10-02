import { useEffect, useState, type ReactNode } from "react";
import type { ProjectSummary } from "../shared/api";
import { api } from "./api/client";
import { PapersPage, TeamPage } from "./pages/Site";
import { StoryStage, type StageId } from "./pages/landing/StoryStage";
import { hasHandoff, peekHandoffName } from "./state/handoff";
import { AppNav, ThemePrompt } from "./components/Chrome";
import { NewsPrompt } from "./components/NewsPrompt";
import { Tour } from "./tutorial/Tour";
import { FeatureNotice } from "./tutorial/FeatureNotice";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import { useTour } from "./tutorial/state";
import { TourFrame } from "./pages/TourFrame";
import { LoadingNetwork } from "./components/canvas/LoadingNetwork";
import { Auth } from "./pages/Auth";
import { Landing } from "./pages/Landing";
import { Projects } from "./pages/Projects";
import { Settings } from "./pages/Settings";
import { Workspace } from "./pages/Workspace";
import { Link, matchPath, navigate, useLocation } from "./router";
import { useSession } from "./state/session";

const TITLES: Record<string, string> = {
  "/": "IdeaLens. See how ideas connect.",
  "/login": "Sign in / IdeaLens",
  "/signup": "Create an account / IdeaLens",
  "/projects": "History / IdeaLens",
  "/settings": "Settings / IdeaLens",
  "/team": "Team / IdeaLens",
  "/papers": "Papers / IdeaLens",
  "/privacy": "Privacy Policy / IdeaLens",
  "/terms": "Terms of Service / IdeaLens",
};

export function App() {
  const { pathname } = useLocation();
  const newsPrompt = useSession((state) => state.newsPrompt);
  const status = useSession((state) => state.status);

  useEffect(() => {
    void useSession.getState().load();
  }, []);

  // A first-time account starts the tutorial; one in the middle of it carries on. Signing out closes it.
  useEffect(() => {
    if (status === "signedIn") useTour.getState().resume();
    else if (status === "signedOut") useTour.setState({ phase: "closed", projectId: null, returnTo: null, step: 0 });
  }, [status]);

  useEffect(() => {
    document.title =
      TITLES[pathname] ??
      (pathname.endsWith("/interpretation") ? "Interpretation / IdeaLens" : pathname.startsWith("/projects/") ? "Analysis / IdeaLens" : "IdeaLens. See how ideas connect.");
  }, [pathname]);

  // The platform, shown inside the landing page's tour: the page alone, no questions over it.
  if (pathname === "/tour") return <TourFrame />;

  return (
    <>
      <Page pathname={pathname} />
      <ThemePrompt />
      {pathname !== "/login" && pathname !== "/signup" && <NewsPrompt />}
      {/* The tutorial waits until the question about news is answered: one modal at a time. */}
      {status === "signedIn" && !newsPrompt && pathname !== "/login" && pathname !== "/signup" && <Tour />}
      {status === "signedIn" && !newsPrompt && pathname !== "/login" && pathname !== "/signup" && <FeatureNotice />}
    </>
  );
}

function Page({ pathname }: { pathname: string }) {
  if (pathname === "/") return <Landing />;
  if (pathname === "/login") return <Auth mode="login" />;
  if (pathname === "/signup") return <Auth mode="signup" />;
  if (pathname === "/projects") {
    return (
      <RequireUser>
        <Projects />
      </RequireUser>
    );
  }
  const reading = matchPath("/projects/:id/interpretation", pathname);
  if (reading) {
    return (
      <RequireUser>
        <Workspace key={`${reading.id}-interpretation`} id={reading.id} view="interpretation" />
      </RequireUser>
    );
  }
  const project = matchPath("/projects/:id", pathname);
  if (project) {
    return (
      <RequireUser>
        <Workspace key={project.id} id={project.id} />
      </RequireUser>
    );
  }
  if (pathname === "/settings") {
    return (
      <RequireUser>
        <Settings />
      </RequireUser>
    );
  }
  if (pathname === "/start") {
    return (
      <RequireUser>
        <StartResearch />
      </RequireUser>
    );
  }
  // Development only: one state of the landing drawing, alone, for checking it.
  if (import.meta.env.DEV && pathname === "/__stage") return <StagePreview />;
  if (pathname === "/team") return <TeamPage />;
  if (pathname === "/papers") return <PapersPage />;
  if (pathname === "/privacy") return <PrivacyPage />;
  if (pathname === "/terms") return <TermsPage />;
  return <NotFound />;
}

function StagePreview() {
  const { search } = useLocation();
  const stage = (search.get("s") ?? "source") as StageId;
  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      <StoryStage stage={stage} label={stage} />
    </main>
  );
}

let starting: Promise<string> | null = null;

/**
 * Research brought in on the landing page becomes a new analysis, named as the
 * researcher named it; the workspace then reads its file. Once only, even when
 * React mounts this twice.
 */
function StartResearch() {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!hasHandoff() && !starting) {
      navigate("/projects", { replace: true });
      return;
    }
    starting ??= (async () => {
      const name = peekHandoffName();
      const { project } = await api<{ project: ProjectSummary }>("POST", "/projects", name ? { name } : {});
      return project.id;
    })();
    starting
      .then((id) => navigate(`/projects/${id}`, { replace: true }))
      .catch((error: Error) => setProblem(error.message))
      .finally(() => {
        starting = null;
      });
  }, []);
  return (
    <main className="pf-page-state">
      {problem ? (
        <div className="ml-empty">
          <div className="ml-empty__eyebrow">The analysis was not created</div>
          <p className="ml-empty__body">{problem}</p>
          <Link to="/projects" className="ml-btn ml-btn--secondary">
            Go to your history
          </Link>
        </div>
      ) : (
        <LoadingNetwork caption="Starting your analysis…" />
      )}
    </main>
  );
}

/** Pages that belong to an account: signed-out visitors go to sign in, then come back. */
function RequireUser({ children }: { children: ReactNode }) {
  const status = useSession((state) => state.status);
  const { pathname } = useLocation();
  useEffect(() => {
    if (status === "signedOut") navigate(`/login?next=${encodeURIComponent(pathname)}`, { replace: true });
  }, [status, pathname]);
  if (status !== "signedIn") {
    return (
      <main className="pf-page-state">
        <LoadingNetwork caption="Checking your sign-in…" />
      </main>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="pf-page">
      <AppNav />
      <main className="pf-page__main">
        <div className="ml-empty">
          <div className="ml-empty__eyebrow">No such page</div>
          <p className="ml-empty__body">There is nothing at this address. The overview and your analyses are a link away.</p>
          <div className="pf-row">
            <Link to="/" className="ml-btn ml-btn--secondary">
              Overview
            </Link>
            <Link to="/projects" className="ml-btn ml-btn--primary">
              History
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
