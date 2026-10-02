// Parses off the main thread so a large file never freezes the interface.

import { parseText, ParseError, type ParseOptions } from "./parse";

self.onmessage = (event: MessageEvent<{ text: string; options: ParseOptions }>) => {
  try {
    const table = parseText(event.data.text, event.data.options);
    (self as unknown as Worker).postMessage({ ok: table });
  } catch (error) {
    const message =
      error instanceof ParseError ? error.message : `The file could not be read: ${(error as Error).message}`;
    (self as unknown as Worker).postMessage({ error: message });
  }
};
