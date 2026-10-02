// A button that opens a short list of actions or choices: the theme switcher,
// the account menu, an analysis's actions. A popover is the one other place the
// system's single shadow belongs (README: Borders, radius & shadow).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function Menu({
  label,
  trigger,
  triggerClassName = "ml-btn ml-btn--ghost",
  align = "end",
  children,
}: {
  /** What the button does, for assistive technology when its content is an icon. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "start" | "end";
  /** Items; call close() after acting. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const items = () => [...(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the chosen item, or the first.
    const list = items();
    (list.find((item) => item.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      list[event.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <span className="pf-menu-wrap" ref={wrap} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`pf-menu pf-menu--${align}`} role="menu" id={menuId} aria-label={label}>
          {children(() => close())}
        </div>
      )}
    </span>
  );
}

export function MenuItem({
  children,
  onSelect,
  checked,
  disabled,
  tone,
}: {
  children: ReactNode;
  onSelect: () => void;
  /** For a choice among several (menuitemradio). */
  checked?: boolean;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      className={`pf-menu__item${tone === "danger" ? " pf-menu__item--danger" : ""}`}
      disabled={disabled}
      tabIndex={-1}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
