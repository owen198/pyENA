import { useMemo } from "react";
import { absentCodes, censusGroups, staleReason, validate } from "../model/config";
import { useStore } from "./store";

/** Unmet requirements for a run, in the order the checklist shows them. */
export function useIssues() {
  const source = useStore((state) => state.source);
  const model = useStore((state) => state.model);
  const figures = useStore((state) => state.figures);
  return useMemo(() => {
    if (!source) return [];
    const census = model.groupColumn ? censusGroups(source.table.rows, model.units, model.groupColumn) : null;
    return validate(model, figures, census, absentCodes(source.table.rows, model));
  }, [source, model, figures]);
}

/** Results exist but no longer match the configuration in the rail. */
export function useIsStale() {
  const result = useStore((state) => state.result);
  const model = useStore((state) => state.model);
  return result !== null && staleReason(model, result.model) !== null;
}
