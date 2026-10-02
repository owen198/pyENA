// Settings come from the environment only. Nothing secret is ever written into
// the repository: see .env.example for the names, and set the values on the
// server (or in a local .env that git ignores).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load KEY=value lines from .env, without overriding the real environment. */
function loadDotEnv(file = resolve(process.cwd(), ".env")) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv();

const env = process.env;

export const config = {
  production: env.NODE_ENV === "production",
  // An empty value counts as unset: Docker Compose passes unset settings as "".
  port: Number(env.PORT || 8787),
  /** The requester's MongoDB. When unset, development starts a local one in .data/. */
  mongoUri: env.MONGODB_URI || null,
  mongoDb: env.MONGODB_DB || "pyena",
  localDataDir: resolve(process.cwd(), env.PYENA_DATA_DIR ?? ".data/mongo"),
  /** Cookies are sent only over HTTPS when true; set on the deployed server. */
  cookieSecure: env.COOKIE_SECURE === "true",
  sessionDays: Number(env.SESSION_DAYS || 14),
  /** Claude interpretation is offered only when credentials are configured. */
  anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  anthropicModel: env.ANTHROPIC_MODEL || "claude-opus-5-5",
  /** OpenAI is used instead when it has a key and Anthropic has none. */
  openaiConfigured: Boolean(env.OPENAI_API_KEY),
  openaiModel: env.OPENAI_MODEL || "gpt-5",
  openaiBaseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  /** Open sign-up; set to "false" to allow only existing accounts. */
  allowSignup: env.ALLOW_SIGNUP !== "false",
};
