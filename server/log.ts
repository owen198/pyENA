// The server's log: one line per event, the time first, so the host's log
// (`docker compose logs`) shows when things happened and what came just
// before a stop. Passwords, tokens, datasets and AI text are never logged.

let installed = false;

/** Put the time in front of every console line, the libraries' included. */
export function installTimestamps() {
  if (installed) return;
  installed = true;
  for (const method of ["log", "info", "warn", "error"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => original(new Date().toISOString(), ...args);
  }
}

function format(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  const text = String(value);
  return /^[\w.:/@-]+$/.test(text) ? text : JSON.stringify(text);
}

/** `log("login.ok", { user: "nhi" })` writes `login.ok user=nhi`. Empty fields are left out. */
export function log(event: string, fields: Record<string, unknown> = {}) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${format(value)}`);
  console.log([event, ...parts].join(" "));
}

export const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
