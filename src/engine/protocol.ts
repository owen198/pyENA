// Messages between the main thread and the Pyodide worker (plan §3.3).

export type Tokens = Record<string, string>;

export type BootPhase = "runtime" | "packages" | "library";

/** The steps pyENA works through, reported from Python as each one starts. */
export type RunPhase = "boot" | "accumulate" | "rotate" | "networks" | "statistics" | "plot" | "plotly" | "plot3d";

export interface ModelInput {
  codes: string[];
  units: string[];
  conversation: string[];
  metadata: string[];
  model: "EndPoint";
  window: "MovingStanzaWindow" | "Conversation";
  window_size_back: number;
  window_size_forward: number;
  rotation: "svd" | "mean";
  dimensions: 2 | 3;
  group_column: string;
  groups: [string, string];
}

export interface FigureInput {
  color_a: string;
  color_b: string;
  show_ci: boolean;
  show_labels: boolean;
  /** The individual comparison: one unit from each group, as in generate_analysis_outputs. */
  focus_unit_a: string | null;
  focus_unit_b: string | null;
}

export interface EngineError {
  kind:
    | "group_size"
    | "zero_variance"
    | "means_rotation"
    | "means_rotation_empty"
    | "singular"
    | "chi_square_zero"
    | "no_state"
    | "figure"
    | "library"
    | "engine";
  message: string;
  detail: string | null;
}

export interface RunOutput {
  summary_json: string;
  units: { label: string; group: string | null }[];
  figures: Record<string, string>;
  /** The units the individual comparison was drawn for. */
  focus: [string, string];
  /** plotly figure JSON for the 3D networks, when the model has three dimensions. */
  figures3d?: Record<string, string>;
  /** Why the 3D networks could not be drawn, when the 2D results still stand. */
  figures3dError?: string;
}

export interface Rendered {
  figures: Record<string, string>;
  focus: [string, string];
}

export interface EngineVersions {
  python: string;
  pyodide: string;
  numpy: string;
  scipy: string;
  matplotlib: string;
}

export type MainToWorker =
  | { type: "boot"; pyodideBase: string; archiveUrl: string; fontUrl: string; tokens: Tokens }
  | {
      type: "run";
      id: number;
      recordsJson: string;
      model: ModelInput;
      figures: FigureInput;
      figureIds: string[];
      /** False to skip the 3D networks: rebuilding a saved analysis's model needs no figures. */
      with3d?: boolean;
    }
  | { type: "render"; id: number; figureIds: string[]; figures: FigureInput }
  | { type: "render3d"; id: number; figures: FigureInput }
  | { type: "export"; id: number; figureId: string; format: "svg" | "png" | "html"; figures: FigureInput };

export type WorkerToMain =
  | { type: "boot:progress"; phase: BootPhase }
  | { type: "boot:ready"; versions: EngineVersions }
  | { type: "boot:error"; message: string }
  | { type: "run:phase"; id: number; phase: RunPhase }
  | { type: "run:done"; id: number; output: RunOutput }
  | { type: "render:done"; id: number; rendered: Rendered }
  | { type: "render3d:done"; id: number; figures3d: Record<string, string> }
  | { type: "export:done"; id: number; bytes: Uint8Array }
  | { type: "request:error"; id: number; error: EngineError };
