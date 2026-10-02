import { useId, useMemo, useRef, useState } from "react";
import { configFileJson } from "../../results/exports";
import {
  absentCodes,
  binaryColumns,
  censusGroups,
  COLOR_TOKENS,
  tokenValue,
  validate,
  validWindowSize,
  WINDOW_MAX,
  type Field as FieldName,
  type ModelConfig,
} from "../../model/config";
import { useStore } from "../../state/store";
import { CheckIcon, IndexMark } from "../../ui/marks";
import { ChipSelect, download, Field, FlagNote, Toggle, type ChipOption } from "../../ui/primitives";
import { meaningOf } from "../../data/schema";
import { Notices } from "./Rail";

type Role = "codes" | "units" | "conversation" | "metadata";

const ROLE_NAMES: Record<Role, string> = {
  codes: "a code",
  units: "a unit",
  conversation: "a conversation column",
  metadata: "metadata",
};

export function ConfigPanel() {
  const source = useStore((state) => state.source);
  const model = useStore((state) => state.model);
  const figures = useStore((state) => state.figures);
  const updateModel = useStore((state) => state.updateModel);
  const updateFigures = useStore((state) => state.updateFigures);
  const loadConfigText = useStore((state) => state.loadConfigText);
  const schema = useStore((state) => state.schema);
  const [showAllCodes, setShowAllCodes] = useState(false);
  const configInput = useRef<HTMLInputElement>(null);

  const census = useMemo(
    () => (source && model.groupColumn ? censusGroups(source.table.rows, model.units, model.groupColumn) : null),
    [source, model.groupColumn, model.units],
  );
  const absent = useMemo(() => (source ? absentCodes(source.table.rows, model) : []), [source, model]);
  const issues = useMemo(() => validate(model, figures, census, absent), [model, figures, census, absent]);
  if (!source) return null;

  const errorFor = (field: FieldName) => issues.find((issue) => issue.field === field)?.message ?? null;
  const { columns, profiles } = source.table;
  const profileOf = (column: string) => profiles.find((profile) => profile.name === column)!;
  const binary = binaryColumns(profiles);

  // A column plays one role: a unit cannot also be a code (plan §9.3).
  const roleOf = (column: string): Role | null => {
    if (model.codes.includes(column)) return "codes";
    if (model.units.includes(column)) return "units";
    if (model.conversation.includes(column)) return "conversation";
    return null;
  };
  const chipOptions = (role: Role, candidates: string[]): ChipOption[] =>
    candidates.map((column) => {
      const other = roleOf(column);
      const exclusive = role === "codes" || other === "codes";
      const blocked = exclusive && other !== null && other !== role;
      return {
        value: column,
        disabledReason: blocked ? `Already ${ROLE_NAMES[other!]}.` : undefined,
        flag: profileOf(column).missingCount > 0 ? `${profileOf(column).missingCount} missing values` : undefined,
      };
    });

  const codeCandidates = showAllCodes ? columns : columns.filter((column) => binary.includes(column) || model.codes.includes(column));
  const nonBinaryCodes = model.codes.filter((code) => !binary.includes(code));
  const missingCodes = model.codes.filter((code) => profileOf(code).missingCount > 0);
  const [a, b] = model.groups;
  const groupValues = census?.values ?? [];
  const inComparison =
    census && a && b
      ? groupValues.filter((value) => value.value === a || value.value === b).reduce((sum, value) => sum + value.units, 0)
      : null;

  const valueLabel = (value: { value: string; rows: number; units: number }) =>
    model.units.length > 0
      ? `${value.value} (${value.units} ${value.units === 1 ? "unit" : "units"})`
      : `${value.value} (${value.rows} rows)`;

  const saveConfig = () => download("config.json", configFileJson(source, model, figures), "application/json");

  return (
    <>
      <Notices />

      {/* ------------------------------------------------ DATA COLUMNS */}
      <section className="pf-group" aria-labelledby="cfg-columns">
        <GroupLabel id="cfg-columns">Data columns</GroupLabel>

        <Field
          label="Codes"
          required
          hint={
            (showAllCodes
              ? "Every column is listed. pyENA reads 0/1, true/false and yes/no; other values are coerced."
              : `Columns holding only 0/1 values. ${model.codes.length} selected.`) +
            (schema ? ` Hover a code for its meaning in ${schema.fileName}.` : "")
          }
        >
          <div className="pf-row pf-row--tight">
            <button
              type="button"
              className="ml-btn ml-btn--ghost"
              onClick={() => updateModel({ codes: [...new Set([...model.codes, ...binary.filter((column) => !roleOf(column) || roleOf(column) === "codes")])] })}
              disabled={binary.length === 0}
            >
              Select all binary ({binary.length})
            </button>
            {model.codes.length > 0 && (
              <button type="button" className="ml-filter-clear" onClick={() => updateModel({ codes: [] })}>
                Clear
              </button>
            )}
          </div>
          <ChipSelect
            label="Codes"
            options={chipOptions("codes", codeCandidates).map((option) => ({
              ...option,
              meaning: meaningOf(schema, option.value) ?? undefined,
            }))}
            selected={model.codes}
            onChange={(codes) => updateModel({ codes: columns.filter((column) => codes.includes(column)) })}
          />
          <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setShowAllCodes(!showAllCodes)}>
            {showAllCodes ? "Show binary columns only" : "Show all columns"}
          </button>
        </Field>
        {nonBinaryCodes.length > 0 && (
          <FlagNote>
            {nonBinaryCodes.join(", ")} {nonBinaryCodes.length === 1 ? "is not a 0/1 column" : "are not 0/1 columns"}.
            pyENA counts any positive number as present and other text as absent.
          </FlagNote>
        )}
        {missingCodes.length > 0 && (
          <FlagNote>
            {missingCodes.map((code) => `${code} (${profileOf(code).missingCount})`).join(", ")}{" "}
            {missingCodes.length === 1 ? "has" : "have"} missing values; pyENA counts a missing code as absent.
          </FlagNote>
        )}

        <Field label="Units" required hint="Each unique combination is one unit: one network, one projected point.">
          <ChipSelect
            label="Units"
            options={chipOptions("units", columns)}
            selected={model.units}
            onChange={(units) => updateModel({ units })}
          />
        </Field>

        <Field label="Conversation" required hint="Co-occurrences are counted only within one conversation.">
          <ChipSelect
            label="Conversation"
            options={chipOptions("conversation", columns)}
            selected={model.conversation}
            onChange={(conversation) => updateModel({ conversation })}
          />
        </Field>

        <Field label="Metadata" hint="Carried with each unit. The group column is always included.">
          <ChipSelect
            label="Metadata"
            options={chipOptions("metadata", columns)}
            selected={model.metadata}
            onChange={(metadata) => updateModel({ metadata })}
          />
        </Field>
      </section>

      {/* ------------------------------------------------ ACCUMULATION */}
      <section className="pf-group" aria-labelledby="cfg-accumulation">
        <GroupLabel id="cfg-accumulation">Accumulation</GroupLabel>
        <Field label="Model" hint="One accumulated network per unit.">
          <p className="body">EndPoint</p>
        </Field>
        <SelectField
          label="Window"
          value={model.window}
          options={[
            ["MovingStanzaWindow", "Moving stanza window"],
            ["Conversation", "Whole conversation"],
          ]}
          onChange={(window) => updateModel({ window: window as ModelConfig["window"] })}
        />
        <WindowControls model={model} onChange={updateModel} />
      </section>

      {/* ------------------------------------------------ ROTATION */}
      <section className="pf-group" aria-labelledby="cfg-rotation">
        <GroupLabel id="cfg-rotation">Rotation and comparison</GroupLabel>
        <SelectField
          label="Rotation"
          value={model.rotation}
          options={[
            ["svd", "Singular value decomposition (svd)"],
            ["mean", "Means rotation (mean)"],
          ]}
          error={errorFor("rotation")}
          hint={
            model.rotation === "mean"
              ? "The first dimension runs through the two group means."
              : "Dimensions capture the most variance across all units."
          }
          onChange={(rotation) => updateModel({ rotation: rotation as ModelConfig["rotation"] })}
        />
        <Field
          label="Dimensions"
          hint={
            model.dimensions === 3
              ? "A Z axis, and 3D networks you can rotate with the mouse. The first 3D run downloads the 3D plotting library (plotly, about 5 MB)."
              : "Choose 3D for a Z axis and 3D networks you can rotate with the mouse."
          }
        >
          <div className="ml-filters" role="group" aria-label="Dimensions">
            {([
              [2, "2D", "x, y"],
              [3, "3D", "x, y, z"],
            ] as const).map(([value, name, axes]) => (
              <button
                key={value}
                type="button"
                className="ml-filter pf-chip"
                aria-pressed={model.dimensions === value}
                onClick={() => updateModel({ dimensions: value })}
              >
                {model.dimensions === value && <CheckIcon size={14} />}
                {name} <span className="pf-chip__sub">({axes})</span>
              </button>
            ))}
          </div>
        </Field>
        <SelectField
          label="Group column"
          required
          value={model.groupColumn ?? ""}
          placeholder="Choose a column"
          options={columns.map((column) => [column, `${column} (${profileOf(column).uniqueCount} values)`])}
          onChange={(groupColumn) => updateModel({ groupColumn: groupColumn || null, groups: [null, null] })}
        />
        {model.groupColumn && (
          <>
            {groupValues.length < 2 ? (
              <FlagNote>{model.groupColumn} has fewer than two distinct values; there is nothing to compare.</FlagNote>
            ) : (
              <div className="pf-stack">
                <SelectField
                  label="Compare"
                  value={a ?? ""}
                  placeholder="First group"
                  options={groupValues.map((value) => [value.value, valueLabel(value)])}
                  onChange={(value) => updateModel({ groups: [value || null, b] })}
                />
                <SelectField
                  label="With"
                  value={b ?? ""}
                  placeholder="Second group"
                  options={groupValues.map((value) => [value.value, valueLabel(value)])}
                  error={errorFor("groups")}
                  hint={
                    inComparison !== null && census && inComparison < census.totalUnits
                      ? `${census.totalUnits - inComparison} of ${census.totalUnits} units are outside this comparison.`
                      : undefined
                  }
                  onChange={(value) => updateModel({ groups: [a, value || null] })}
                />
                {census && census.mixedUnits > 0 && (
                  <FlagNote>
                    {model.groupColumn} changes within {census.mixedUnits} {census.mixedUnits === 1 ? "unit" : "units"};
                    pyENA assigns each unit the group of its first row.
                  </FlagNote>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------ FIGURES */}
      <section className="pf-group" aria-labelledby="cfg-figures">
        <GroupLabel id="cfg-figures">Figures</GroupLabel>
        <p className="small pf-note">These redraw the figures. They do not change the model.</p>
        <ColorField
          label={`${a ?? "First group"} colour`}
          value={figures.colorA}
          onChange={(colorA) => updateFigures({ colorA })}
          hint="Its points, its mean network, and edges stronger in this group."
        />
        <ColorField
          label={`${b ?? "Second group"} colour`}
          value={figures.colorB}
          onChange={(colorB) => updateFigures({ colorB })}
          hint="Drawn with triangles as well, so colour never carries the group alone."
          error={errorFor("colors")}
        />
        <Toggle label="Show confidence intervals" checked={figures.showCI} onChange={(showCI) => updateFigures({ showCI })} />
        <Toggle label="Show node labels" checked={figures.showLabels} onChange={(showLabels) => updateFigures({ showLabels })} />
      </section>

      <section className="pf-group" aria-label="Configuration file">
        <div className="pf-row">
          <button type="button" className="ml-btn ml-btn--secondary" onClick={saveConfig}>
            Save configuration
          </button>
          <button type="button" className="ml-btn ml-btn--ghost" onClick={() => configInput.current?.click()}>
            Load configuration
          </button>
          <input
            ref={configInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void file.text().then(loadConfigText);
            }}
          />
        </div>
      </section>
    </>
  );
}

function GroupLabel({ id, children }: { id: string; children: string }) {
  return (
    <h3 className="metadata pf-group__label" id={id}>
      <IndexMark size={24} />
      {children}
    </h3>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  error,
  required,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} wide>
      <select id={id} className="ml-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder && (
          <option value="" disabled={value !== ""}>
            {placeholder}
          </option>
        )}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Stanza window: two numbers and a diagram of what they cover (plan §9.3).
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  min,
  hint,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  hint: string;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [touched, setTouched] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }
  const parsed = draft.trim() === "" ? NaN : Number(draft);
  const valid = validWindowSize(parsed, min);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={disabled ? undefined : hint}
      error={touched && !valid && !disabled ? `A whole number from ${min} to ${WINDOW_MAX}.` : null}
    >
      <input
        id={id}
        className="ml-input pf-num"
        type="number"
        inputMode="numeric"
        min={min}
        max={WINDOW_MAX}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (validWindowSize(next, min)) onCommit(next);
        }}
        onBlur={() => {
          setTouched(true);
          if (!valid) onCommit(parsed);
        }}
      />
    </Field>
  );
}

function WindowControls({ model, onChange }: { model: ModelConfig; onChange: (patch: Partial<ModelConfig>) => void }) {
  const whole = model.window === "Conversation";
  return (
    <div className="pf-window">
      <div className="pf-stack" style={{ gap: "var(--space-4)" }}>
        <NumberField
          label="Lines back"
          value={model.windowBack}
          min={1}
          disabled={whole}
          hint="Counts the responding line itself."
          onCommit={(windowBack) => onChange({ windowBack })}
        />
        <NumberField
          label="Lines forward"
          value={model.windowForward}
          min={0}
          disabled={whole}
          hint="Lines after the responding line."
          onCommit={(windowForward) => onChange({ windowForward })}
        />
      </div>
      <div className="pf-stack">
        <WindowDiagram back={model.windowBack} forward={model.windowForward} whole={whole} />
        <p className="small pf-note">
          {whole ? "The whole conversation is the window." : windowSentence(model.windowBack, model.windowForward)}
        </p>
      </div>
    </div>
  );
}

export function windowSentence(back: number, forward: number): string {
  if (!Number.isInteger(back) || !Number.isInteger(forward) || back < 1) return "Set the window to see what it covers.";
  const before = back - 1;
  const parts = [`the responding line`];
  if (before > 0) parts.push(`${before} ${before === 1 ? "line" : "lines"} before it`);
  if (forward > 0) parts.push(`${forward} ${forward === 1 ? "line" : "lines"} after it`);
  const joined = parts.length === 3 ? `${parts[0]}, ${parts[1]} and ${parts[2]}` : parts.join(" and ");
  return `Each line connects to codes in ${joined}, within its conversation.`;
}

const ROWS = 7;
const ROW_H = 16;
const WIDTHS = [96, 72, 104, 84, 100, 66, 90];

function WindowDiagram({ back, forward, whole }: { back: number; forward: number; whole: boolean }) {
  const validBack = Number.isInteger(back) && back >= 1 ? back : 1;
  const validForward = Number.isInteger(forward) && forward >= 0 ? forward : 0;
  const shownAfter = Math.min(validForward, 2);
  const current = ROWS - 1 - shownAfter;
  const first = whole ? 0 : Math.max(0, current - (validBack - 1));
  const last = whole ? ROWS - 1 : Math.min(ROWS - 1, current + validForward);
  const hiddenBefore = whole ? 0 : Math.max(0, validBack - 1 - current);
  const hiddenAfter = whole ? 0 : Math.max(0, validForward - shownAfter);
  const height = ROWS * ROW_H + 8;

  return (
    <svg
      viewBox={`0 0 176 ${height}`}
      width="176"
      height={height}
      role="img"
      aria-label={whole ? "The window covers the whole conversation." : windowSentence(back, forward)}
    >
      <rect className="pf-window__band" x="0" y={first * ROW_H} width="112" height={(last - first + 1) * ROW_H + 2} rx="2" />
      {WIDTHS.map((width, row) => {
        const inWindow = row >= first && row <= last;
        const className =
          row === current && !whole ? "pf-window__line pf-window__line--current" : inWindow ? "pf-window__line pf-window__line--in" : "pf-window__line";
        return <rect key={row} className={className} x="6" y={row * ROW_H + 5} width={width} height="7" rx="1" />;
      })}
      {!whole && (
        <text className="ml-chart-label" x="120" y={current * ROW_H + 12}>
          responding
        </text>
      )}
      {hiddenBefore > 0 && (
        <text className="ml-chart-label" x="120" y="12">
          +{hiddenBefore} above
        </text>
      )}
      {hiddenAfter > 0 && (
        <text className="ml-chart-label" x="120" y={height - 4}>
          +{hiddenAfter} below
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Colour: token presets and a hex field (plan §9.3).
// ---------------------------------------------------------------------------

function ColorField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  error?: string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const presets = COLOR_TOKENS.map((name) => ({ name, hex: tokenValue(name) }));
  const commit = (next: string) => {
    const hex = next.trim().startsWith("#") ? next.trim() : `#${next.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
    else setDraft(value);
  };
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="pf-row">
        <div className="pf-swatches" role="group" aria-label={`${label}: design tokens`}>
          {presets.map((preset) => {
            const pressed = preset.hex.toLowerCase() === value.toLowerCase();
            return (
              <button
                key={preset.name}
                type="button"
                className="pf-swatch"
                style={{ background: preset.hex }}
                aria-pressed={pressed}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => onChange(preset.hex)}
              >
                {pressed && <CheckIcon size={16} />}
              </button>
            );
          })}
        </div>
        <input
          id={id}
          className="ml-input pf-hex"
          value={draft}
          spellCheck={false}
          aria-label={`${label}, hex value`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => event.key === "Enter" && commit(draft)}
        />
      </div>
    </Field>
  );
}
