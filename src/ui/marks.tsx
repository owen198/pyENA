// Geometry copied from the design system's Logo, BrandSymbols and Icons
// previews. Colours are tokens; nothing here is redrawn by eye.

import type { CSSProperties, SVGProps } from "react";

/**
 * The IdeaLens mark: a lowercase i whose stem is an extruded block and whose
 * tittle is the accent node, wired by edges to two more (Logo README). The
 * stem's faces take --logo-top and --logo-side (theme.css) so the lit top
 * stays the lightest face and the side the darkest in either theme. The full
 * three-node mark holds to 24px; below that the third node and its edge go and
 * the edges thicken, as the README's 16px version does.
 */
export function Logo({ size = 24 }: { size?: number }) {
  if (size < 24) {
    return (
      <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
        <g stroke="var(--brand)" strokeWidth="3.4" strokeLinecap="round">
          <line x1="28" y1="14" x2="12" y2="27" />
          <line x1="28" y1="14" x2="45" y2="28" />
        </g>
        <path d="M24,24 L32,24 L36,20 L28,20 Z" fill="var(--logo-top)" />
        <path d="M32,24 L32,47 L36,43 L36,20 Z" fill="var(--logo-side)" />
        <path d="M24,24 L32,24 L32,47 L24,47 Z" fill="var(--brand)" />
        <circle cx="12" cy="27" r="6" fill="var(--brand)" />
        <circle cx="45" cy="28" r="6" fill="var(--brand)" />
        <circle cx="28" cy="14" r="8.4" fill="var(--accent)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
      {/* Edges first, so they tuck behind the stem and the nodes. */}
      <g stroke="var(--brand)" strokeWidth="2" strokeLinecap="round">
        <line x1="28" y1="13" x2="11" y2="26" />
        <line x1="28" y1="13" x2="46" y2="27" />
        <line x1="11" y1="26" x2="18" y2="44" />
      </g>
      <path d="M24,24 L32,24 L36,20 L28,20 Z" fill="var(--logo-top)" />
      <path d="M32,24 L32,47 L36,43 L36,20 Z" fill="var(--logo-side)" />
      <path d="M24,24 L32,24 L32,47 L24,47 Z" fill="var(--brand)" />
      <circle cx="11" cy="26" r="4.4" fill="var(--brand)" />
      <circle cx="46" cy="27" r="4.4" fill="var(--brand)" />
      <circle cx="18" cy="44" r="3.8" fill="var(--brand-dark)" />
      <circle cx="28" cy="13" r="7" fill="var(--accent)" />
    </svg>
  );
}

type SymbolProps = { size?: number; className?: string };

/** Brand symbol: two nodes joined — beside the Network tab and the run action. */
export function ConnectionMark({ size = 24, className }: SymbolProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="9" cy="23" r="3" fill="var(--ink)" />
      <circle cx="24" cy="10" r="3" fill="var(--ink)" />
      <line x1="11.4" y1="20.5" x2="21.6" y2="12.5" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

/** Brand symbol: a person's mark in the margin — beside an inline validation note. */
export function AnnotationMark({ size = 24, className }: SymbolProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M7 25V9h9" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="23" cy="10" r="3" fill="var(--accent)" />
    </svg>
  );
}

/** Brand symbol: the index bracket — in the configuration group headers. */
export function IndexMark({ size = 24, className }: SymbolProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M11 4H5v24h6" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M21 4h6v24h-6" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

/** Brand symbol: the accent finding mark. */
export function FindingMark({ size = 24, className }: SymbolProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.4" />
      <circle cx="16" cy="16" r="5" fill="var(--accent)" />
    </svg>
  );
}

/**
 * The Network bloom sticker, the Stickers set's flagship, copied from its
 * preview: a stem whose flower heads are nodes, joined by dashed edges. Its
 * parts carry class names so the band can let it bloom and its nodes breathe;
 * the geometry is the sticker's. Decorative, so hidden from assistive technology.
 */
export function NetworkBloom({ className, style }: { className?: string; style?: CSSProperties }) {
  const node = (delay: string) => ({ ["--n" as string]: delay }) as CSSProperties;
  return (
    <svg className={className} style={style} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <path className="ml-sticker-ink pf-bloom__stem" pathLength={1} strokeWidth="3.5" d="M61,118 C58,100 64,88 57,74 C52,62 55,52 58,44" />
      <path className="ml-sticker-ink pf-bloom__branch" pathLength={1} d="M56,76 C46,76 37,70 32,60" />
      <path className="ml-sticker-ink pf-bloom__branch" pathLength={1} d="M57,64 C67,64 77,58 83,50" />
      <path className="ml-sticker-fill-brand pf-bloom__leaf" d="M58,98 C47,99 38,93 35,84 C45,80 55,86 58,98 Z" />
      <path className="ml-sticker-fill-brand pf-bloom__leaf" d="M60,88 C71,89 79,83 82,74 C72,71 62,77 60,88 Z" />
      <path className="ml-sticker-ink pf-bloom__edge" strokeWidth="2" strokeDasharray="4 5" d="M48,40 C42,44 37,50 34,54" />
      <path className="ml-sticker-ink pf-bloom__edge" strokeWidth="2" strokeDasharray="4 5" d="M68,38 C74,40 79,43 82,46" />
      {/* Outer group opens and closes with the bloom; inner group breathes. */}
      <g className="pf-bloom__node" style={node("0ms")}>
        <g className="pf-bloom__breath">
          <ellipse className="ml-sticker-fill-accent" cx="58" cy="32" rx="12" ry="11" transform="rotate(-7 58 32)" />
        </g>
      </g>
      <g className="pf-bloom__node" style={node("300ms")}>
        <g className="pf-bloom__breath">
          <ellipse className="ml-sticker-fill-blue" cx="29" cy="57" rx="9" ry="8.4" transform="rotate(9 29 57)" />
        </g>
      </g>
      <g className="pf-bloom__node" style={node("600ms")}>
        <g className="pf-bloom__breath">
          <ellipse className="ml-sticker-fill-paper" cx="86" cy="47" rx="9.5" ry="8.8" transform="rotate(-11 86 47)" />
        </g>
      </g>
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, className, ...rest }: IconProps) {
  return (
    <svg
      className={className ? `ml-icon ${className}` : "ml-icon"}
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <line x1="5" y1="5" x2="15" y2="15" />
    <line x1="15" y1="5" x2="5" y2="15" />
  </Icon>
);

export const ArrowIcon = (props: IconProps) => (
  <Icon {...props}>
    <line x1="4" y1="10" x2="15" y2="10" />
    <polyline points="11,6 15,10 11,14" />
  </Icon>
);

/** Download: the Arrow turned down onto a baseline, drawn to the Icons construction. */
export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <line x1="10" y1="3.5" x2="10" y2="12.5" />
    <polyline points="6,9 10,13 14,9" />
    <line x1="4.5" y1="16.5" x2="15.5" y2="16.5" />
  </Icon>
);

/** A conversation: a speech bubble. Not in the Icons set; drawn to its construction. */
export const ChatIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5.5 Q4 4 5.5 4 L14.5 4 Q16 4 16 5.5 L16 11.5 Q16 13 14.5 13 L9 13 L5.5 16 L5.5 13 Q4 13 4 11.5 Z" />
  </Icon>
);

/** Send: the Arrow turned up. Not in the Icons set; drawn to its construction. */
export const SendIcon = (props: IconProps) => (
  <Icon {...props}>
    <line x1="10" y1="16" x2="10" y2="5" />
    <polyline points="6,9 10,5 14,9" />
  </Icon>
);

/** Not in the Icons set; drawn to its construction (20px box, 1.5 stroke, round caps). */
export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <polyline points="4.5,10.5 8.5,14 15.5,6" />
  </Icon>
);

/** Theme: light. Drawn to the Icons construction (20px box, 1.5 stroke, round caps). */
export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="10" r="3.5" />
    <line x1="10" y1="2" x2="10" y2="3.8" />
    <line x1="10" y1="16.2" x2="10" y2="18" />
    <line x1="2" y1="10" x2="3.8" y2="10" />
    <line x1="16.2" y1="10" x2="18" y2="10" />
    <line x1="4.35" y1="4.35" x2="5.6" y2="5.6" />
    <line x1="14.4" y1="14.4" x2="15.65" y2="15.65" />
    <line x1="4.35" y1="15.65" x2="5.6" y2="14.4" />
    <line x1="14.4" y1="5.6" x2="15.65" y2="4.35" />
  </Icon>
);

/** Theme: dark. */
export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15.8 12.6A6.6 6.6 0 0 1 7.4 4.2a6.6 6.6 0 1 0 8.4 8.4z" />
  </Icon>
);

/** Theme: match the computer. */
export const ComputerIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.75" y="3.75" width="14.5" height="9.5" rx="1.5" />
    <line x1="10" y1="13.25" x2="10" y2="16.25" />
    <line x1="6.5" y1="16.5" x2="13.5" y2="16.5" />
  </Icon>
);

/**
 * The arrow a mouse pointer draws, tip at its top-left corner (2, 2): the
 * landing page's upload demo and the tutorial's "click here" both use it.
 */
export function PointerArrow({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 24" width={size} height={(size * 24) / 20} aria-hidden="true">
      <path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z" fill="var(--ink)" stroke="var(--surface)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
