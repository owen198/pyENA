// Claude writes a results interpretation with pyENA's own skill
// (skills/interpret-ena-results/SKILL.md, vendored at the pinned commit) as its
// instructions. Offered only when the server has Anthropic credentials, or
// failing that an OpenAI key (openai.ts), with the same instructions; the
// platform's built-in writer works without either.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import type { ConnectionRequest, InterpretRequest, InterpretStatus } from "../shared/api.ts";
import { requireUser } from "./auth.ts";
import { config } from "./config.ts";
import { OpenAIError, streamOpenAI, type ChatTurn } from "./openai.ts";

const SKILL = readFileSync(fileURLToPath(new URL("./skills/interpret-ena-results/SKILL.md", import.meta.url)), "utf8");

/** Frozen, so the prompt cache can reuse it across requests. */
const SYSTEM = `${SKILL}

## On IdeaLens

You are writing the results interpretation for a researcher using IdeaLens, a web platform that runs pyENA. You receive pyENA's statistical_summary.json, the researcher's coding schema (each code and what it means), a short description of the analysis, and a few excerpts from the coded data where two codes occur in the same line.

- Follow the Core Rule, the Paragraph Requirement and the Style above.
- Use each code's meaning from the coding schema when you name a code, so a reader who does not know the codes can follow. Keep the code's name too, in parentheses.
- Report every statistic with the test that produced it, the n, and the p value, using only numbers present in the input. Do not invent data, excerpts or citations.
- The excerpts are the only qualitative data available; quote them sparingly and only as they are given.
- pyENA's group tests cover dimensions 1 and 2. If the model has three dimensions, say that the third appears in fit and axis interpretation only.
- Write plain text paragraphs with no headings, no bullet lists and no Markdown.`;

/**
 * Instructions for a conversation about one figure or one edge. Frozen, like
 * SYSTEM, so every conversation shares one cached prefix.
 */
const CONNECTION_SYSTEM = `${SKILL}

## Connection analysis on IdeaLens

A researcher using IdeaLens, a web platform that runs pyENA, has selected one figure or one connection (an edge between two codes) of their epistemic network analysis and is asking about it. The first message gives you everything gathered for that figure or edge only: the group mean weights pyENA computed and where the edge ranks, what the codes mean, how many lines of talk bring the two codes together inside the stanza window (by group and unit), numbered evidence lines [E1], [E2] and so on, and counter-evidence. You do not have the rest of the dataset.

Rules for every answer:
- Cite the data only with the references given, such as [E3], placed right after the claim they support. Never invent a reference, a quotation, a number or a source. Use the numbers in the context exactly as given.
- Keep evidence, inference and speculation apart, and say which is which: start such paragraphs with "Evidence:", "Inference:" or "Speculation:".
- Co-occurrence inside a stanza window is not causation, agreement or influence. When the question or your own reading suggests a causal claim, challenge it and say what the data can and cannot show.
- When asked why something holds, give at least one alternative explanation the evidence does not rule out, such as how the talk was prompted, who spoke, or how the codes were applied.
- Use the counter-evidence: say where the connection is weak or absent, and for whom.
- When the evidence given cannot answer the question, say exactly: "The available evidence isn't sufficient to determine this." Then say what evidence would.
- Name a code by its meaning, with the code in parentheses, when the context gives a meaning.
- Answer the question that was asked, in a few short paragraphs of plain text. No headings, no tables, no Markdown.`;

/** The first turn carries the gathered context, cached, then the researcher's question. */
function connectionMessages(body: ConnectionRequest): Anthropic.Beta.BetaMessageParam[] {
  return body.turns.map((turn, index) =>
    index === 0
      ? {
          role: "user" as const,
          content: [
            { type: "text" as const, text: `Context gathered for ${body.label}:\n\n${body.context}`, cache_control: { type: "ephemeral" as const } },
            { type: "text" as const, text: turn.text },
          ],
        }
      : { role: turn.role, content: turn.text },
  );
}

/** Why a connection request cannot be taken, or null when it can. */
function connectionProblem(body: ConnectionRequest | undefined): string | null {
  if (!body || typeof body.label !== "string" || typeof body.context !== "string" || !Array.isArray(body.turns)) {
    return "The request needs the connection's context and the question.";
  }
  if (body.label.length > 300 || body.context.length > 60_000) return "The connection's context is too long.";
  if (body.turns.length === 0 || body.turns.length > 41) return "The conversation needs between one and 41 turns.";
  const valid = body.turns.every(
    (turn, index) => turn && typeof turn.text === "string" && turn.text.trim() !== "" && turn.text.length <= 8000 && turn.role === (index % 2 === 0 ? "user" : "assistant"),
  );
  if (!valid || body.turns.length % 2 === 0) return "The conversation must alternate, starting and ending with a question.";
  return null;
}

/** The same conversation for OpenAI: the context goes first, in the first question. */
function connectionTurns(body: ConnectionRequest): ChatTurn[] {
  return body.turns.map((turn, index) => ({
    role: turn.role,
    content: index === 0 ? `Context gathered for ${body.label}:\n\n${body.context}\n\n${turn.text}` : turn.text,
  }));
}

/** What a failed OpenAI call tells the researcher, and the status to answer with. */
function openaiFailure(error: OpenAIError): { status: number; message: string } {
  if (error.status === 401 || error.status === 403) return { status: 503, message: "The server's OpenAI API key was not accepted." };
  if (error.status === 429) return { status: 429, message: "The AI is busy right now. Wait a minute and try again." };
  if (error.status === 404) return { status: 502, message: `The OpenAI model "${config.openaiModel}" is not available to this key. Set OPENAI_MODEL on the server.` };
  return { status: 502, message: "Unable to reach the AI right now. Try again shortly." };
}

function describe(request: InterpretRequest): string {
  const { context, schema, summaryJson } = request;
  const schemaText = schema.length
    ? schema.map((entry) => `- ${entry.code}: ${entry.meaning}`).join("\n")
    : "(No coding schema was uploaded. Describe codes by name.)";
  const excerpts = context.excerpts.length
    ? context.excerpts
        .map((excerpt) => `- ${excerpt.group}, ${excerpt.unit}, where ${excerpt.codes[0]} and ${excerpt.codes[1]} co-occur: "${excerpt.text}"`)
        .join("\n")
    : "(No text column was found, so there are no excerpts.)";
  return [
    `Analysis: ${context.fileName}; groups ${context.groups[0]} and ${context.groups[1]} (column ${context.groupColumn}); ${context.rotation === "mean" ? "means" : "SVD"} rotation; ${context.dimensions} dimensions; ${context.window}.`,
    "",
    "Coding schema:",
    schemaText,
    "",
    "Excerpts from the coded data:",
    excerpts,
    "",
    "statistical_summary.json:",
    summaryJson,
    "",
    "Write the interpretation.",
  ].join("\n");
}

export function interpretRoutes() {
  const router = express.Router();
  const client = config.anthropicConfigured ? new Anthropic() : null;
  const openai = !client && config.openaiConfigured;

  router.get("/interpret/status", requireUser, (_req, res) => {
    const status: InterpretStatus = client
      ? { available: true, model: config.anthropicModel, provider: "Claude" }
      : openai
        ? { available: true, model: config.openaiModel, provider: "OpenAI" }
        : { available: false, model: null, provider: null };
    res.json(status);
  });

  // One figure or one edge: the answer is streamed as it is written, one JSON
  // object per line ({type: "text"}, then {type: "done"} or {type: "error"}).
  router.post("/interpret/connection", requireUser, async (req, res) => {
    if (!client && !openai) {
      return void res.status(503).json({ error: "The AI reading is not set up on this server. The evidence is still shown." });
    }
    const body = req.body as ConnectionRequest | undefined;
    const problem = connectionProblem(body);
    if (problem) return void res.status(400).json({ error: problem });

    let started = false;
    const send = (line: Record<string, unknown>) => {
      if (!started) {
        started = true;
        // no-transform keeps the compression middleware from holding the stream back.
        res.status(200).set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
        res.flushHeaders();
      }
      res.write(`${JSON.stringify(line)}\n`);
    };

    if (!client) {
      const abort = new AbortController();
      let open = true;
      res.on("close", () => {
        if (open) abort.abort();
      });
      try {
        const reply = await streamOpenAI(CONNECTION_SYSTEM, connectionTurns(body!), (text) => send({ type: "text", text }), abort.signal);
        if (reply.refused) send({ type: "error", error: "Unable to analyse this connection right now." });
        else send({ type: "done", model: reply.model, truncated: reply.truncated });
        open = false;
        res.end();
      } catch (error) {
        open = false;
        if (res.writableEnded || req.destroyed) return;
        const failure = error instanceof OpenAIError ? openaiFailure(error) : { status: 502, message: "Unable to analyse this connection right now." };
        if (started) {
          send({ type: "error", error: failure.message });
          res.end();
        } else {
          res.status(failure.status).json({ error: failure.message });
        }
      }
      return;
    }

    const stream = client.beta.messages.stream({
      model: config.anthropicModel,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // Opus 5.5 defaults to medium effort; set it explicitly so the setting is visible here.
      ...({ output_config: { effort: "medium" } } as Record<string, unknown>),
      betas: ["server-side-fallback-2026-07-01"],
      ...({ fallbacks: "default" } as Record<string, unknown>),
      system: [{ type: "text", text: CONNECTION_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: connectionMessages(body!),
    });
    let open = true;
    // The researcher closed the window or the page: stop paying for an answer nobody reads.
    res.on("close", () => {
      if (open) stream.abort();
    });

    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
      }
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") send({ type: "error", error: "Unable to analyse this connection right now." });
      else send({ type: "done", model: message.model, truncated: message.stop_reason === "max_tokens" });
      open = false;
      res.end();
    } catch (error) {
      open = false;
      if (res.writableEnded || req.destroyed) return;
      const message =
        error instanceof Anthropic.AuthenticationError
          ? "The server's Anthropic API key was not accepted."
          : error instanceof Anthropic.RateLimitError
            ? "The AI is busy right now. Wait a minute and try again."
            : error instanceof Anthropic.APIError
              ? "Unable to analyse this connection right now."
              : null;
      if (!message) throw error;
      if (started) {
        send({ type: "error", error: message });
        res.end();
      } else {
        res.status(error instanceof Anthropic.RateLimitError ? 429 : 502).json({ error: message });
      }
    }
  });

  router.post("/interpret", requireUser, async (req, res) => {
    if (!client && !openai) {
      return void res.status(503).json({ error: "The AI is not set up on this server. The built-in interpretation is still available." });
    }
    const body = req.body as InterpretRequest;
    if (typeof body?.summaryJson !== "string" || !body.context) {
      return void res.status(400).json({ error: "The request needs pyENA's summary and the analysis context." });
    }

    if (!client) {
      try {
        let text = "";
        const reply = await streamOpenAI(SYSTEM, [{ role: "user", content: describe(body) }], (piece) => (text += piece));
        if (reply.refused) {
          return void res.status(422).json({ error: "The AI declined to write this interpretation. The built-in interpretation is still available." });
        }
        if (!text.trim()) return void res.status(502).json({ error: "The AI returned no text. Try again." });
        res.json({ text: text.trim(), model: reply.model, truncated: reply.truncated });
      } catch (error) {
        const failure = error instanceof OpenAIError ? openaiFailure(error) : { status: 502, message: "Unable to reach the AI right now. Try again shortly." };
        res.status(failure.status).json({ error: failure.message });
      }
      return;
    }

    try {
      // Streamed so a long answer never meets an HTTP timeout; finalMessage()
      // returns the whole message. Server-side fallbacks re-run a declined
      // request on Anthropic's recommended model instead of returning a refusal.
      const stream = client.beta.messages.stream({
        model: config.anthropicModel,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        betas: ["server-side-fallback-2026-07-01"],
        ...({ fallbacks: "default" } as Record<string, unknown>),
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: describe(body) }],
      });
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        return void res.status(422).json({ error: "Claude declined to write this interpretation. The built-in interpretation is still available." });
      }
      const text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n\n")
        .trim();
      if (!text) return void res.status(502).json({ error: "Claude returned no text. Try again." });
      res.json({ text, model: message.model, truncated: message.stop_reason === "max_tokens" });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        res.status(503).json({ error: "The server's Anthropic API key was not accepted." });
      } else if (error instanceof Anthropic.RateLimitError) {
        res.status(429).json({ error: "Claude is busy right now. Wait a minute and try again." });
      } else if (error instanceof Anthropic.BadRequestError) {
        res.status(502).json({ error: `Claude could not take this request: ${error.message}` });
      } else if (error instanceof Anthropic.APIError) {
        res.status(502).json({ error: `Claude is unavailable (${error.status ?? "no response"}). Try again shortly.` });
      } else {
        throw error;
      }
    }
  });

  return router;
}
