// Light, dark, or match the computer. IdeaLens never changes theme behind the
// researcher's back: when the computer's setting differs from IdeaLens's (on a
// first visit, or when the computer switches while IdeaLens is open) it asks,
// unless they chose to always match the computer.

import { create } from "zustand";
import type { ThemeMode } from "../../shared/api";

export type Scheme = "light" | "dark";

const KEY = "pyena-platform:theme";
const QUERY = "(prefers-color-scheme: dark)";

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match my computer",
};

interface ThemeState {
  /** The researcher's choice; null until they have made one (the paper theme shows). */
  mode: ThemeMode | null;
  /** The computer's own setting. */
  os: Scheme;
  /** The computer's scheme, while IdeaLens is asking whether to follow it. */
  prompt: Scheme | null;
  /** A choice made here, in the prompt, the menu or Settings. Saved to the account. */
  choose(mode: ThemeMode): void;
  /** The account's saved choice, on sign-in. Not a new choice, so not saved back. */
  adopt(mode: ThemeMode): void;
  answer(answer: "switch" | "keep" | "always"): void;
  /** Close the question without choosing; it comes back on the next visit. */
  dismiss(): void;
}

export function schemeOf(mode: ThemeMode | null, os: Scheme): Scheme {
  if (mode === "system") return os;
  return mode === "dark" ? "dark" : "light";
}

function readStored(): ThemeMode | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

function store(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
}

let shiftTimer: ReturnType<typeof setTimeout> | undefined;

function apply(scheme: Scheme) {
  const root = document.documentElement;
  const value = scheme === "dark" ? "dark" : "paper";
  if (root.dataset.theme === value) return;
  // Colours cross-fade once (theme.css), then transitions are off again so
  // they never slow down ordinary interaction.
  root.classList.add("pf-theme-shift");
  root.dataset.theme = value;
  clearTimeout(shiftTimer);
  shiftTimer = setTimeout(() => root.classList.remove("pf-theme-shift"), 320);
}

const choiceListeners = new Set<(mode: ThemeMode) => void>();

/** Called with each choice the researcher makes, so the account can save it. */
export function onThemeChoice(listener: (mode: ThemeMode) => void): () => void {
  choiceListeners.add(listener);
  return () => void choiceListeners.delete(listener);
}

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY) : null;
const initialMode = readStored();
const initialOs: Scheme = media?.matches ? "dark" : "light";

export const useTheme = create<ThemeState>((set, get) => ({
  mode: initialMode,
  os: initialOs,
  // First visit: the paper theme shows, and IdeaLens asks if the computer is dark.
  prompt: initialMode === null && initialOs === "dark" ? "dark" : null,

  choose(mode) {
    store(mode);
    set({ mode, prompt: null });
    apply(schemeOf(mode, get().os));
    choiceListeners.forEach((listener) => listener(mode));
  },

  adopt(mode) {
    store(mode);
    set({ mode, prompt: null });
    apply(schemeOf(mode, get().os));
  },

  answer(answer) {
    const { prompt, mode, os } = get();
    if (answer === "always") get().choose("system");
    else if (answer === "switch" && prompt) get().choose(prompt);
    // Keeping the current look is a choice too: it stops the first-visit question.
    else get().choose(schemeOf(mode, os));
  },

  dismiss() {
    set({ prompt: null });
  },
}));

media?.addEventListener("change", (event) => {
  const os: Scheme = event.matches ? "dark" : "light";
  const { mode } = useTheme.getState();
  if (mode === "system") {
    useTheme.setState({ os, prompt: null });
    apply(os);
    return;
  }
  // Ask only when the computer now differs from what IdeaLens shows.
  useTheme.setState({ os, prompt: schemeOf(mode, os) === os ? null : os });
});

/** The scheme IdeaLens is showing now. */
export function useScheme(): Scheme {
  return useTheme((state) => schemeOf(state.mode, state.os));
}
