import type { ParsedTable, ParseOptions } from "./parse";

export const SOFT_LIMIT = 10 * 1024 * 1024;
export const HARD_LIMIT = 50 * 1024 * 1024;

export const ACCEPT = ".csv,.tsv,.txt,text/csv,text/tab-separated-values";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sizeProblem(bytes: number): { fatal: boolean; message: string } | null {
  if (bytes > HARD_LIMIT) {
    return {
      fatal: true,
      message: `This file is ${formatBytes(bytes)}. The platform reads files up to 50 MB in the browser.`,
    };
  }
  if (bytes > SOFT_LIMIT) {
    return { fatal: false, message: `This file is ${formatBytes(bytes)}; reading and analysis will be slower.` };
  }
  return null;
}

export function parseInWorker(text: string, options: ParseOptions): Promise<ParsedTable> {
  const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok?: ParsedTable; error?: string }>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.ok);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`The file could not be read: ${event.message}`));
    };
    worker.postMessage({ text, options });
  });
}
