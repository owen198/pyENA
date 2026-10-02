// The analysis engine: Pyodide + pyENA, off the main thread (plan §3.2).
// On the main thread ena() would freeze the interface for the whole run.

import type { PyodideInterface } from "pyodide";
import bridgeSource from "./bridge.py?raw";
import type { EngineError, MainToWorker, WorkerToMain } from "./protocol";

type PyProxy = { [name: string]: (...args: unknown[]) => unknown };

/** The plotly release pyENA's 3D module is used with (the library's own environment). */
const PLOTLY_VERSION = "7.1.0";

let pyodide: PyodideInterface | null = null;
let bridge: PyProxy | null = null;
let booting: Promise<void> | null = null;
let plotlyReady: Promise<void> | null = null;

/** plotly is not a Pyodide package; install it from PyPI the first time a 3D model needs it. */
function ensurePlotly(py: PyodideInterface): Promise<void> {
  plotlyReady ??= (async () => {
    await py.loadPackage("micropip", { messageCallback: () => {} });
    await py.runPythonAsync(`import micropip\nawait micropip.install("plotly==${PLOTLY_VERSION}")`);
  })().catch((error) => {
    plotlyReady = null;
    throw error;
  });
  return plotlyReady;
}

function post(message: WorkerToMain, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(message, transfer);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function boot(message: Extract<MainToWorker, { type: "boot" }>) {
  post({ type: "boot:progress", phase: "runtime" });
  const module = await import(/* @vite-ignore */ `${message.pyodideBase}pyodide.mjs`);
  const py: PyodideInterface = await module.loadPyodide({ indexURL: message.pyodideBase });

  post({ type: "boot:progress", phase: "packages" });
  await py.loadPackage(["numpy", "scipy", "matplotlib"], { messageCallback: () => {} });

  post({ type: "boot:progress", phase: "library" });
  const [archive, font] = await Promise.all([fetchBytes(message.archiveUrl), fetchBytes(message.fontUrl)]);
  const site = py.runPython("import site; site.getsitepackages()[0]") as string;
  py.unpackArchive(archive, "zip", { extractDir: site });
  py.FS.writeFile(`${site}/pyena_platform_bridge.py`, bridgeSource);
  py.FS.writeFile("/tmp/Figtree-VariableFont_wght.ttf", font);

  const loaded = py.pyimport("pyena_platform_bridge") as unknown as PyProxy;
  loaded.configure(JSON.stringify(message.tokens), "/tmp/Figtree-VariableFont_wght.ttf");

  const versions = JSON.parse(
    py.runPython(`
import json, sys, numpy, scipy, matplotlib
json.dumps({"python": sys.version.split()[0], "numpy": numpy.__version__,
            "scipy": scipy.__version__, "matplotlib": matplotlib.__version__})
`) as string,
  );
  pyodide = py;
  bridge = loaded;
  post({ type: "boot:ready", versions: { ...versions, pyodide: py.version } });
}

function fail(id: number, error: EngineError) {
  post({ type: "request:error", id, error });
}

function engineError(error: unknown): EngineError {
  const text = error instanceof Error ? error.message : String(error);
  // A Python traceback ends with the exception line; that line is the message.
  const lines = text.trim().split("\n");
  return { kind: "engine", message: lines[lines.length - 1], detail: null };
}

async function handle(message: MainToWorker) {
  if (message.type === "boot") {
    booting ??= boot(message).catch((error) => {
      post({ type: "boot:error", message: engineError(error).message });
      throw error;
    });
    return;
  }

  try {
    await booting;
  } catch {
    return; // boot:error has already been reported
  }
  if (!pyodide || !bridge) return;
  const b = bridge;

  try {
    if (message.type === "run") {
      const onPhase = (phase: string) => post({ type: "run:phase", id: message.id, phase: phase as never });
      const result = JSON.parse(
        b.run(message.recordsJson, JSON.stringify(message.model), onPhase) as string,
      );
      if (result.error) return fail(message.id, result.error);

      post({ type: "run:phase", id: message.id, phase: "plot" });
      const rendered = JSON.parse(b.render(JSON.stringify(message.figureIds), JSON.stringify(message.figures)) as string);
      const output = { ...result.ok, figures: rendered.figures, focus: rendered.focus };

      if (message.model.dimensions === 3 && message.with3d !== false) {
        try {
          post({ type: "run:phase", id: message.id, phase: "plotly" });
          await ensurePlotly(pyodide);
          post({ type: "run:phase", id: message.id, phase: "plot3d" });
          output.figures3d = JSON.parse(b.render3d(JSON.stringify(message.figures)) as string);
        } catch (error) {
          // The model and its 2D results stand; only the 3D view is missing.
          output.figures3dError = engineError(error).message;
        }
      }
      post({ type: "run:done", id: message.id, output });
    } else if (message.type === "render3d") {
      await ensurePlotly(pyodide);
      const figures3d = JSON.parse(b.render3d(JSON.stringify(message.figures)) as string);
      post({ type: "render3d:done", id: message.id, figures3d });
    } else if (message.type === "render") {
      const rendered = JSON.parse(b.render(JSON.stringify(message.figureIds), JSON.stringify(message.figures)) as string);
      post({ type: "render:done", id: message.id, rendered });
    } else if (message.type === "export" && message.format === "html") {
      await ensurePlotly(pyodide);
      const bytes = new TextEncoder().encode(b.export3d(message.figureId, JSON.stringify(message.figures)) as string);
      post({ type: "export:done", id: message.id, bytes }, [bytes.buffer]);
    } else if (message.type === "export") {
      const proxy = b.export(message.figureId, message.format, JSON.stringify(message.figures)) as {
        toJs(): Uint8Array;
        destroy(): void;
      };
      const bytes = proxy.toJs();
      proxy.destroy();
      post({ type: "export:done", id: message.id, bytes }, [bytes.buffer]);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text.includes("PlatformError")) {
      const kind = text.includes("no model in the engine") ? "no_state" : "figure";
      return fail(message.id, { kind, message: engineError(error).message, detail: null });
    }
    fail(message.id, engineError(error));
  }
}

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  void handle(event.data);
};
