// Which results tab to show next, when something outside the tabs asks for one
// (the old /projects/:id/interpretation address opens the Report tab).

import { create } from "zustand";

export type TabId = "data" | "network" | "statistics" | "model" | "report";

export const useResultsTab = create<{ pending: TabId | null; setActive(tab: TabId): void; take(): TabId | null }>((set, get) => ({
  pending: null,
  setActive(tab) {
    set({ pending: tab });
  },
  take() {
    const { pending } = get();
    if (pending) set({ pending: null });
    return pending;
  },
}));
