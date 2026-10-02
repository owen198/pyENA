// Number formatting for reported statistics (plan §11.4): statistics to 2dp,
// p-values to 4dp without the leading zero, p < .001 rather than p = .0000.

const MINUS = "−";

export function num(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? `${MINUS}∞` : "—";
  const text = Math.abs(value).toFixed(digits);
  const isZero = Number(text) === 0;
  return value < 0 && !isZero ? `${MINUS}${text}` : text;
}

export function pValue(p: number): string {
  if (Number.isNaN(p)) return "p not defined (NaN)";
  if (!Number.isFinite(p)) return "p = —";
  if (p < 0.001) return "p < .001";
  if (p > 0.99995) return "p > .9999";
  return `p = ${p.toFixed(4).replace(/^0/, "")}`;
}

export function percent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function interval([low, high]: [number, number], digits = 2): string {
  return `[${num(low, digits)}, ${num(high, digits)}]`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}

/** pyENA names an edge "CodeA__CodeB". */
export function edgeCodes(edge: string): [string, string] {
  const index = edge.indexOf("__");
  return index < 0 ? [edge, ""] : [edge.slice(0, index), edge.slice(index + 2)];
}

/** Lowercased the way generate_analysis_outputs names files, and path-safe. */
export function fileSlug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "group";
}
