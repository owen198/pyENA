// Who is signed in. The session itself is an httpOnly cookie the browser
// never reads; this only mirrors what the server says about it.

import { create } from "zustand";
import type { PublicUser } from "../../shared/api";
import { api, onUnauthorized } from "../api/client";
import { onThemeChoice, useTheme } from "../theme/theme";

interface SessionState {
  status: "loading" | "signedOut" | "signedIn";
  user: PublicUser | null;
  signupOpen: boolean;
  /** Set when the session ended while the researcher was working. */
  expired: boolean;
  /** Asking to connect with the team: at every sign-in until the researcher agrees. */
  newsPrompt: boolean;
  load(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  register(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Not now: asked again at the next sign-in, not before. */
  dismissNews(): void;
  askNews(): void;
  giveNews(email: string, consentText: string): Promise<void>;
  withdrawNews(): Promise<void>;
}

const ASKED = "pyena-platform:news-asked";

function askedThisSession(): boolean {
  try {
    return sessionStorage.getItem(ASKED) === "1";
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    sessionStorage.setItem(ASKED, "1");
  } catch {
    // Without storage it is asked again on reload; that is all.
  }
}

function signedIn(user: PublicUser) {
  useTheme.getState().adopt(user.settings.theme);
  return { status: "signedIn" as const, user, expired: false };
}

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  signupOpen: true,
  expired: false,
  newsPrompt: false,

  async load() {
    try {
      const { user, signupOpen } = await api<{ user: PublicUser | null; signupOpen: boolean }>("GET", "/auth/me");
      // A signed-in visit asks once per browser session until the researcher agrees.
      if (user) set({ ...signedIn(user), signupOpen, newsPrompt: !user.news && !askedThisSession() });
      else set({ status: "signedOut", user: null, signupOpen });
    } catch {
      set({ status: "signedOut", user: null });
    }
  },

  async login(username, password) {
    const { user } = await api<{ user: PublicUser }>("POST", "/auth/login", { username, password });
    set({ ...signedIn(user), newsPrompt: !user.news });
  },

  async register(username, password) {
    // A new account starts with the look the researcher already chose here.
    const theme = useTheme.getState().mode ?? "light";
    const { user } = await api<{ user: PublicUser }>("POST", "/auth/register", { username, password, theme });
    set({ ...signedIn(user), newsPrompt: !user.news });
  },

  async logout() {
    await api("POST", "/auth/logout", {}).catch(() => undefined);
    set({ status: "signedOut", user: null, expired: false, newsPrompt: false });
  },

  dismissNews() {
    markAsked();
    set({ newsPrompt: false });
  },

  askNews() {
    if (get().status === "signedIn") set({ newsPrompt: true });
  },

  async giveNews(email, consentText) {
    const { user } = await api<{ user: PublicUser }>("PUT", "/me/news", { email, consent: true, consentText });
    set({ user, newsPrompt: false });
  },

  async withdrawNews() {
    const { user } = await api<{ user: PublicUser }>("DELETE", "/me/news");
    set({ user });
  },
}));

// A theme chosen while signed in follows the researcher to other computers.
onThemeChoice((theme) => {
  const { status, user } = useSession.getState();
  if (status !== "signedIn" || !user) return;
  useSession.setState({ user: { ...user, settings: { ...user.settings, theme } } });
  void api("PUT", "/me/settings", { theme }).catch(() => undefined);
});

onUnauthorized(() => {
  if (useSession.getState().status === "signedIn") useSession.setState({ status: "signedOut", user: null, expired: true });
});
