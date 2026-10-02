// The team, connected to you: the Node cluster sticker's geometry, one more
// node for the visitor, and the connections between them. Connections draw
// themselves from different people on the team to you, one after another, and
// fade to draw again; every node blooms in and out, and yours blooms as each
// connection arrives. It loops, at the owner's request, as the step band's
// flowers do; reduced motion shows it still. Once connected, the lines stay.

export function ConnectArt({ connected = false, label = "The IdeaLens team, connected to you" }: { connected?: boolean; label?: string }) {
  return (
    <svg className={`ca${connected ? " is-connected" : ""}`} viewBox="0 0 280 140" role="img" aria-label={label}>
      {/* The team: the Node cluster sticker's geometry. */}
      <g transform="translate(0 10)">
        <path className="ml-sticker-ink" strokeWidth="3" d="M58,57 C48,52 38,47 31,44" />
        <path className="ml-sticker-ink" strokeWidth="4.5" d="M60,55 C60,45 61,35 62,28" />
        <path className="ml-sticker-ink" strokeWidth="2.5" d="M64,56 C74,53 84,50 90,49" />
        <path className="ml-sticker-ink" strokeWidth="3.5" d="M63,62 C69,71 75,79 78,84" />
        <path className="ml-sticker-ink" strokeWidth="2" d="M56,62 C50,70 43,77 39,81" />
        <path className="ml-sticker-ink" strokeWidth="2.5" d="M93,55 C90,66 86,76 83,83" />
        <ellipse className="ml-sticker-fill-paper ca-node" style={{ ["--n" as string]: 0 }} cx="28" cy="42" rx="9" ry="8.4" transform="rotate(-8 28 42)" />
        <ellipse className="ml-sticker-fill-blue ca-node" style={{ ["--n" as string]: 1 }} cx="62" cy="24" rx="8.6" ry="8" transform="rotate(6 62 24)" />
        <ellipse className="ml-sticker-fill-paper ca-node" style={{ ["--n" as string]: 2 }} cx="94" cy="48" rx="9" ry="8.5" transform="rotate(10 94 48)" />
        <ellipse className="ml-sticker-fill-blue ca-node" style={{ ["--n" as string]: 3 }} cx="80" cy="88" rx="8.4" ry="7.8" transform="rotate(-5 80 88)" />
        <ellipse className="ml-sticker-fill-paper ca-node" style={{ ["--n" as string]: 4 }} cx="36" cy="84" rx="8.6" ry="8" transform="rotate(7 36 84)" />
        <ellipse className="ml-sticker-fill-accent ca-node" style={{ ["--n" as string]: 5 }} cx="60" cy="58" rx="11" ry="10.2" transform="rotate(-6 60 58)" />
      </g>

      {/* The connections, from three people on the team to you. */}
      <path className="ca-edge" style={{ ["--e" as string]: 0 }} pathLength={1} d="M72,66 C118,38 184,40 228,70" />
      <path className="ca-edge" style={{ ["--e" as string]: 1 }} pathLength={1} d="M104,58 C148,62 190,68 226,76" />
      <path className="ca-edge" style={{ ["--e" as string]: 2 }} pathLength={1} d="M90,99 C140,110 196,98 228,84" />

      {/* You. */}
      <ellipse className={`ca-you ${connected ? "ml-sticker-fill-brand" : "ml-sticker-fill-paper"}`} cx="240" cy="76" rx="14" ry="13" transform="rotate(-7 240 76)" />
    </svg>
  );
}
