// The one way the browser talks to the platform's API. Every request declares
// JSON (the server refuses mutations that do not), errors arrive as ApiError
// with the server's own plain-language message.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** The form field the message is about, when there is one. */
    public readonly field?: string,
  ) {
    super(message);
  }
}

const unauthorizedListeners = new Set<() => void>();

/** Called when a request finds the session has ended (expired, or signed out elsewhere). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => void unauthorizedListeners.delete(listener);
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "The server could not be reached. Check the connection and try again.");
  }
}

async function fail(response: Response, path: string): Promise<never> {
  const data = response.headers.get("content-type")?.includes("json") ? await response.json().catch(() => null) : null;
  if (response.status === 401 && !path.startsWith("/auth/")) unauthorizedListeners.forEach((listener) => listener());
  throw new ApiError(response.status, data?.error ?? `The server answered ${response.status}. Try again.`, data?.field);
}

export async function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await send(method, path, body);
  if (!response.ok) return fail(response, path);
  return (await response.json()) as T;
}

/** A plain-text resource: a project's dataset. */
export async function apiText(path: string): Promise<string> {
  const response = await send("GET", path);
  if (!response.ok) return fail(response, path);
  return response.text();
}
