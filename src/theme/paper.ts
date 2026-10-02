// Figures are drawn on paper in both themes: matplotlib bakes its colours into
// the SVG, and a figure is a printed object, not a piece of interface. Anything
// that colours a figure reads the tokens of the paper theme from this probe,
// never from the page, which may be dark.

let probe: HTMLElement | null = null;

export function paperToken(name: string): string {
  if (!probe) {
    probe = document.createElement("span");
    probe.dataset.theme = "paper";
    probe.hidden = true;
    probe.setAttribute("aria-hidden", "true");
    document.body.append(probe);
  }
  return getComputedStyle(probe).getPropertyValue(`--${name}`).trim();
}
