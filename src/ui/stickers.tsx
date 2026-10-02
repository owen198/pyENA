// The canvas register's stickers. Geometry is copied from the design system's
// Stickers and Hero previews; nothing is redrawn by eye. They belong to the
// landing and sign-in pages only, never beside a real result (README: Two
// registers), and they never move (Stickers README: static by default).

import type { CSSProperties, ReactNode } from "react";

interface StickerProps {
  className?: string;
  style?: CSSProperties;
  /** On the deep brand canvas, brand fills swap to brand-surface so they still read (Stickers README: Color). */
  onBrand?: boolean;
}

function Sticker({ className, style, label, children }: { className?: string; style?: CSSProperties; label: string; children: ReactNode }) {
  return (
    <svg className={`ml-sticker${className ? ` ${className}` : ""}`} style={style} viewBox="0 0 120 120" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function NetworkBloomSticker({ className, style, onBrand }: StickerProps) {
  const leaf = onBrand ? { fill: "var(--brand-surface)" } : undefined;
  return (
    <Sticker className={className} style={style} label="Network bloom">
      <path className="ml-sticker-ink" strokeWidth="3.5" d="M61,118 C58,100 64,88 57,74 C52,62 55,52 58,44" />
      <path className="ml-sticker-ink" d="M56,76 C46,76 37,70 32,60" />
      <path className="ml-sticker-ink" d="M57,64 C67,64 77,58 83,50" />
      <path className="ml-sticker-fill-brand" style={leaf} d="M58,98 C47,99 38,93 35,84 C45,80 55,86 58,98 Z" />
      <path className="ml-sticker-fill-brand" style={leaf} d="M60,88 C71,89 79,83 82,74 C72,71 62,77 60,88 Z" />
      <path className="ml-sticker-ink" strokeWidth="2" strokeDasharray="4 5" d="M48,40 C42,44 37,50 34,54" />
      <path className="ml-sticker-ink" strokeWidth="2" strokeDasharray="4 5" d="M68,38 C74,40 79,43 82,46" />
      <ellipse className="ml-sticker-fill-accent" cx="58" cy="32" rx="12" ry="11" transform="rotate(-7 58 32)" />
      <ellipse className={onBrand ? "ml-sticker-fill-paper" : "ml-sticker-fill-blue"} cx="29" cy="57" rx="9" ry="8.4" transform="rotate(9 29 57)" />
      <ellipse className="ml-sticker-fill-paper" cx="86" cy="47" rx="9.5" ry="8.8" transform="rotate(-11 86 47)" />
    </Sticker>
  );
}

export function NodeClusterSticker({ className, style }: StickerProps) {
  return (
    <Sticker className={className} style={style} label="Node cluster">
      <path className="ml-sticker-ink" strokeWidth="3" d="M58,57 C48,52 38,47 31,44" />
      <path className="ml-sticker-ink" strokeWidth="4.5" d="M60,55 C60,45 61,35 62,28" />
      <path className="ml-sticker-ink" strokeWidth="2.5" d="M64,56 C74,53 84,50 90,49" />
      <path className="ml-sticker-ink" strokeWidth="3.5" d="M63,62 C69,71 75,79 78,84" />
      <path className="ml-sticker-ink" strokeWidth="2" d="M56,62 C50,70 43,77 39,81" />
      <path className="ml-sticker-ink" strokeWidth="2.5" d="M93,55 C90,66 86,76 83,83" />
      <ellipse className="ml-sticker-fill-paper" cx="28" cy="42" rx="9" ry="8.4" transform="rotate(-8 28 42)" />
      <ellipse className="ml-sticker-fill-blue" cx="62" cy="24" rx="8.6" ry="8" transform="rotate(6 62 24)" />
      <ellipse className="ml-sticker-fill-paper" cx="94" cy="48" rx="9" ry="8.5" transform="rotate(10 94 48)" />
      <ellipse className="ml-sticker-fill-blue" cx="80" cy="88" rx="8.4" ry="7.8" transform="rotate(-5 80 88)" />
      <ellipse className="ml-sticker-fill-paper" cx="36" cy="84" rx="8.6" ry="8" transform="rotate(7 36 84)" />
      <ellipse className="ml-sticker-fill-accent" cx="60" cy="58" rx="11" ry="10.2" transform="rotate(-6 60 58)" />
    </Sticker>
  );
}

export function FindingSticker({ className, style }: StickerProps) {
  return (
    <Sticker className={className} style={style} label="Finding">
      <path className="ml-sticker-ink" strokeWidth="2.5" d="M18,22 C22,26 26,30 29,33" />
      <path className="ml-sticker-ink" strokeWidth="2.5" d="M102,24 C98,28 94,31 91,34" />
      <path
        className="ml-sticker-fill-accent"
        d="M60,20 L70,48 L99,49 L76,66 L85,94 L60,77 L35,94 L44,66 L21,49 L50,48 Z"
        transform="rotate(-6 60 57)"
      />
    </Sticker>
  );
}

/**
 * Two speech bubbles, one coded. With `breathe`, each bubble swells and
 * settles in turn, like two people talking (site.css, .st-bubble).
 */
export function CodedTalkSticker({ className, style, breathe = false }: StickerProps & { breathe?: boolean }) {
  const bubble = (index: number) => (breathe ? { className: "st-bubble", style: { ["--b" as string]: index } as CSSProperties } : {});
  return (
    <Sticker className={className} style={style} label="Coded talk">
      <g {...bubble(0)}>
        <path
          className="ml-sticker-fill-paper"
          d="M12,28 C12,20 18,15 27,15 L64,15 C73,15 78,20 78,29 L78,48 C78,57 73,61 64,61 L38,61 L25,72 L28,61 C18,60 12,56 12,48 Z"
        />
        <path className="ml-sticker-ink" strokeWidth="2.5" d="M24,31 C34,30 46,31 56,30" />
        <path className="ml-sticker-ink" strokeWidth="2.5" d="M24,43 C32,42 41,43 49,42" />
      </g>
      <g {...bubble(1)}>
        <path
          className="ml-sticker-fill-brand"
          d="M46,60 C46,53 51,49 59,49 L98,49 C106,49 111,53 111,61 L111,82 C111,90 106,94 98,94 L72,94 L64,105 L66,94 C52,93 46,90 46,82 Z"
        />
        <path className="ml-sticker-ink" strokeWidth="2.5" style={{ stroke: "var(--on-brand)" }} d="M58,66 C68,65 78,66 88,65" />
        <path className="ml-sticker-stroke-accent" d="M58,80 l5,6 9,-13" />
        <path className="ml-sticker-stroke-accent" d="M80,80 l5,6 9,-13" />
      </g>
    </Sticker>
  );
}

export function ProjectedPointsSticker({ className, style }: StickerProps) {
  return (
    <Sticker className={className} style={style} label="Projected points">
      <path className="ml-sticker-hair" d="M60,12 V108" />
      <path className="ml-sticker-hair" d="M12,60 H108" />
      <ellipse className="ml-sticker-fill-paper" cx="58" cy="58" rx="38" ry="23" transform="rotate(-24 58 58)" />
      <circle cx="34" cy="70" r="3.5" fill="var(--ink)" />
      <circle cx="46" cy="62" r="3.5" fill="var(--ink)" />
      <circle cx="70" cy="48" r="3.5" fill="var(--ink)" />
      <circle cx="82" cy="40" r="3.5" fill="var(--ink)" />
      <ellipse className="ml-sticker-fill-accent" cx="58" cy="56" rx="8" ry="7.4" transform="rotate(-8 58 56)" />
    </Sticker>
  );
}

export function StanzaWindowSticker({ className, style }: StickerProps) {
  return (
    <Sticker className={className} style={style} label="Stanza window">
      <path className="ml-sticker-ink" strokeWidth="4" d="M22,24 C40,23 62,24 84,23" />
      <path className="ml-sticker-ink" strokeWidth="4" d="M22,42 C38,41 56,42 72,41" />
      <path className="ml-sticker-ink" strokeWidth="4" d="M22,60 C42,59 66,60 90,59" />
      <path className="ml-sticker-ink" strokeWidth="4" d="M22,78 C36,77 52,78 66,77" />
      <path className="ml-sticker-ink" strokeWidth="4" d="M22,96 C40,95 60,96 80,95" />
      <rect className="ml-sticker-stroke-accent" x="12" y="32" width="90" height="54" rx="8" transform="rotate(-2 57 59)" />
      <path className="ml-sticker-stroke-accent" strokeWidth="3" d="M104,72 v12 M99,79 l5,6 5,-6" />
    </Sticker>
  );
}
