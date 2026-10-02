// OpenAI as the interpretation's AI, for a server that has an OpenAI key and no
// Anthropic one. Called over plain fetch (Chat Completions, streamed), so the
// platform needs no second SDK.

import { config } from "./config.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** An OpenAI reply that was not a success, with its HTTP status. */
export class OpenAIError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface OpenAIReply {
  model: string;
  /** True when the answer stopped at the length limit. */
  truncated: boolean;
  /** True when the model declined (finish_reason "content_filter"). */
  refused: boolean;
}

/**
 * Stream one chat completion. Each piece of text goes to onText as it arrives;
 * the promise settles with the model and why it stopped.
 */
export async function streamOpenAI(
  system: string,
  turns: ChatTurn[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<OpenAIReply> {
  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [{ role: "system", content: system }, ...turns],
      max_completion_tokens: 16000,
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    let detail = "";
    try {
      detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // No JSON body: the status says enough.
    }
    throw new OpenAIError(response.status, detail || response.statusText);
  }

  let model = config.openaiModel;
  let finish: string | null = null;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as {
        model?: string;
        choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
      };
      if (event.model) model = event.model;
      const choice = event.choices?.[0];
      if (choice?.delta?.content) onText(choice.delta.content);
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  return { model, truncated: finish === "length", refused: finish === "content_filter" };
}
