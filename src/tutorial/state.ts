// The first-time tutorial's state. The account keeps where it stands
// (not_started, in_progress, completed, skipped: PUT /api/me/tutorial), so a
// finished or skipped tutorial never starts again, on any computer. This
// browser also remembers the step and the example analysis, so a reload in
// the middle carries on where it was.
//
// The tutorial never takes the researcher's own choice away: started from an
// analysis that already holds data (an example picked on the landing page, a
// file of their own), it runs in a separate example analysis and brings them
// back to theirs at the end. Started from an empty analysis, it uses that one
// rather than leaving an empty draft in the history.

import { create } from "zustand";
import type { ProjectSummary, TutorialState } from "../../shared/api";
import { api } from "../api/client";
import { navigate } from "../router";
import { useSession } from "../state/session";
import { hasHandoff } from "../state/handoff";
import { useStore } from "../state/store";
import { TUTORIAL_SAMPLE } from "../data/samples";

const KEY = "idealens:tour:";

/** The analysis the researcher was in when the tutorial started, to go back to. */
export interface ReturnTo {
  id: string;
  name: string;
}

interface Saved {
  step: number;
  projectId: string;
  returnTo?: ReturnTo | null;
}

function readSaved(userId: string): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY + userId) ?? "null") as Saved | null;
    return value && typeof value.step === "number" && typeof value.projectId === "string" ? value : null;
  } catch {
    return null;
  }
}

function writeSaved(userId: string, saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(KEY + userId, JSON.stringify(saved));
    else localStorage.removeItem(KEY + userId);
  } catch {
    // Without storage a reload starts the tutorial's steps over; nothing else is lost.
  }
}

/** The one-time notice about interpretation in the figures (src/tutorial/FeatureNotice.tsx). */
export const FIGURE_NOTICE = "figure-interpretation";
/** The one-time tip under the Interpretation button (src/components/results/Results.tsx). */
export const INTERPRET_HINT = "interpretation-button";

/** Mark a one-time notice seen: the current tutorial already teaches what it announces. */
export function markNoticeSeen(id: string) {
  const { user } = useSession.getState();
  if (!user || user.settings.notices?.includes(id)) return;
  useSession.setState({ user: { ...user, settings: { ...user.settings, notices: [...(user.settings.notices ?? []), id] } } });
  void api("PUT", "/me/notices", { id }).catch(() => undefined);
}

/** Record the account's tutorial state on the server and in the session. */
function record(state: TutorialState) {
  const { user } = useSession.getState();
  if (!user) return;
  useSession.setState({ user: { ...user, settings: { ...user.settings, tutorial: state } } });
  void api("PUT", "/me/tutorial", { state }).catch(() => undefined);
}

/** The analysis open on screen, if the researcher is in one. */
function openAnalysis(): { id: string; name: string; empty: boolean } | null {
  const match = /^\/projects\/([^/]+)/.exec(location.pathname);
  const { project, source, result, parsing, pendingFile, pendingSample } = useStore.getState();
  if (!match || !project || project.id !== match[1]) return null;
  // Data on its way (an example still loading, research carried from the landing page) is not empty.
  const arriving = parsing.status === "parsing" || pendingFile !== null || pendingSample !== null || hasHandoff();
  return { id: project.id, name: project.name, empty: source === null && result === null && !arriving };
}

export type Phase = "closed" | "intro" | "starting" | "running" | "finished";

interface TourState {
  phase: Phase;
  /** Index into STEPS (src/tutorial/steps.tsx). */
  step: number;
  /** The example analysis the tutorial runs in. */
  projectId: string | null;
  /** The researcher's own analysis, to go back to when the tutorial ends. */
  returnTo: ReturnTo | null;
  problem: string | null;
  /** On sign-in: start for a first-time account, carry on for one in the middle. */
  resume(): void;
  /** Start: a new analysis for the example, opened in the workspace. */
  start(): Promise<void>;
  goTo(step: number): void;
  finish(): void;
  /** Leave the platform as it is and never start again on its own. */
  skip(): void;
  /** Close after the last card; back to the researcher's own analysis unless they stay. */
  complete(stay?: boolean): void;
  /** Help → Tutorial: from the beginning, in a new example analysis. */
  restart(): void;
}

export const useTour = create<TourState>((set, get) => ({
  phase: "closed",
  step: 0,
  projectId: null,
  returnTo: null,
  problem: null,

  resume() {
    const user = useSession.getState().user;
    if (!user || get().phase !== "closed") return;
    const state = user.settings.tutorial;
    if (state === "not_started") set({ phase: "intro", step: 0, projectId: null, returnTo: null, problem: null });
    else if (state === "in_progress") {
      const saved = readSaved(user.id);
      if (saved) set({ phase: "running", step: saved.step, projectId: saved.projectId, returnTo: saved.returnTo ?? null, problem: null });
      else set({ phase: "intro", step: 0, projectId: null, returnTo: null, problem: null });
    }
  },

  async start() {
    const user = useSession.getState().user;
    if (!user) return;
    set({ phase: "starting", problem: null });
    try {
      const here = openAnalysis();
      // An empty analysis becomes the example; one with data stays as it is and waits for the researcher.
      if (here?.empty) {
        useStore.getState().renameProject(TUTORIAL_SAMPLE.name);
        writeSaved(user.id, { step: 0, projectId: here.id, returnTo: null });
        record("in_progress");
        set({ phase: "running", step: 0, projectId: here.id, returnTo: null });
        return;
      }
      const returnTo = here ? { id: here.id, name: here.name } : null;
      const { project } = await api<{ project: ProjectSummary }>("POST", "/projects", { name: TUTORIAL_SAMPLE.name });
      writeSaved(user.id, { step: 0, projectId: project.id, returnTo });
      record("in_progress");
      set({ phase: "running", step: 0, projectId: project.id, returnTo });
      navigate(`/projects/${project.id}`);
    } catch (error) {
      set({ phase: "intro", problem: error instanceof Error ? error.message : "The example analysis could not be created." });
    }
  },

  goTo(step) {
    const user = useSession.getState().user;
    const { projectId, returnTo } = get();
    if (user && projectId) writeSaved(user.id, { step, projectId, returnTo });
    set({ step });
  },

  finish() {
    set({ phase: "finished" });
  },

  skip() {
    const user = useSession.getState().user;
    const { phase, returnTo } = get();
    if (user) writeSaved(user.id, null);
    record("skipped");
    markNoticeSeen(FIGURE_NOTICE);
    markNoticeSeen(INTERPRET_HINT);
    set({ phase: "closed", projectId: null, returnTo: null, step: 0 });
    // Skipped part-way through: back to the analysis the researcher came from.
    if (phase === "running" && returnTo) navigate(`/projects/${returnTo.id}`);
  },

  complete(stay = false) {
    const user = useSession.getState().user;
    const { returnTo } = get();
    if (user) writeSaved(user.id, null);
    record("completed");
    markNoticeSeen(FIGURE_NOTICE);
    markNoticeSeen(INTERPRET_HINT);
    set({ phase: "closed", projectId: null, returnTo: null, step: 0 });
    if (!stay && returnTo) navigate(`/projects/${returnTo.id}`);
  },

  restart() {
    const user = useSession.getState().user;
    if (user) writeSaved(user.id, null);
    set({ phase: "intro", step: 0, projectId: null, returnTo: null, problem: null });
  },
}));
