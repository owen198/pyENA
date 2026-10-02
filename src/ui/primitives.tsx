// Thin React wrappers over the design system's .ml-* classes. Styling lives in
// bundle.css; these add behaviour the static previews leave to the consumer
// (focus handling, keyboard, ARIA).

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnnotationMark, CheckIcon } from "./marks";

// ---------------------------------------------------------------------------
// Modal (Modal README): one decision, instant open/close, scrim closes it.
// ---------------------------------------------------------------------------

export function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && ref.current) {
        const focusable = [...ref.current.querySelectorAll<HTMLElement>("button, [href], input, select")];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="pf-modal-layer">
      <div className="ml-scrim" onClick={(event) => event.target === event.currentTarget && onClose()}>
        <div className="ml-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
          <h2 className="ml-modal__title" id={titleId}>
            {title}
          </h2>
          <div className="ml-modal__body">{children}</div>
          <div className="ml-modal__actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip (Tooltip README): ink fill, surface text, on hover or focus.
// ---------------------------------------------------------------------------

export function Tip({ text, children, align = "center" }: { text: string; children: ReactNode; align?: "center" | "start" | "end" }) {
  const id = useId();
  return (
    <span className={`ml-tip-wrap pf-tip--${align}`} aria-describedby={id}>
      {children}
      <span className="ml-tip" id={id} role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function InfoTip({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="ml-tip-wrap pf-tip--end">
      <button type="button" className="ml-tip-trigger" aria-describedby={id} aria-label={label}>
        i
      </button>
      <span className="ml-tip pf-tip--wrap" id={id} role="tooltip">
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toggle: the one control radius-full is reserved for.
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="pf-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="pf-toggle__track"
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="pf-toggle__thumb" />
      </button>
      <span className="pf-toggle__label">{label}</span>
      <span className="pf-toggle__state small">{checked ? "On" : "Off"}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Chip multi-select (Filters README): selected = brand fill + a check mark.
// ---------------------------------------------------------------------------

export interface ChipOption {
  value: string;
  disabledReason?: string;
  flag?: string;
  /** What the column means, from the coding schema; shown on hover and focus. */
  meaning?: string;
}

export function ChipSelect({
  label,
  options,
  selected,
  onChange,
  describedBy,
}: {
  label: string;
  options: ChipOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  describedBy?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };
  return (
    <div className="ml-filters pf-chips" role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map((option) => {
        const pressed = selected.includes(option.value);
        const disabled = Boolean(option.disabledReason) && !pressed;
        const chip = (
          <button
            key={option.value}
            type="button"
            className="ml-filter pf-chip"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => toggle(option.value)}
          >
            {pressed && <CheckIcon size={14} />}
            {option.value}
            {option.flag && !pressed && <span className="pf-chip__flag" aria-label={option.flag} />}
          </button>
        );
        const tip = disabled ? option.disabledReason! : option.meaning;
        return tip ? (
          <Tip key={option.value} text={tip} align="start">
            <span className="pf-chip-wrap">{chip}</span>
          </Tip>
        ) : (
          chip
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field: label above, hint or error below (Inputs README).
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  wide,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`ml-field${error ? " ml-field--invalid" : ""}${wide ? " pf-field--wide" : ""}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          {label}
          {required && <span className="pf-required"> (required)</span>}
        </label>
      ) : (
        <span className="pf-field__label">
          {label}
          {required && <span className="pf-required"> (required)</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="ml-field-hint pf-hint--flag">
          <AnnotationMark size={24} />
          {error}
        </span>
      ) : (
        hint && <span className="ml-field-hint">{hint}</span>
      )}
    </div>
  );
}

/** One flagged line: the annotation mark and a sentence in accent. */
export function FlagNote({ children }: { children: ReactNode }) {
  return (
    <p className="pf-flag small">
      <AnnotationMark size={24} />
      <span>{children}</span>
    </p>
  );
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
