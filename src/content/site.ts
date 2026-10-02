// What the landing page says about the people and the papers. Edit this file
// to fill it in; the page lays out whatever is here. A null field shows as
// "To be added", so nothing is ever invented to fill a gap.

export interface TeamMember {
  name: string | null;
  role: string | null;
  affiliation: string | null;
  /** A page about them (a profile, a lab page); optional. */
  url?: string;
}

export interface Paper {
  /** As cited: "Tan, Y., Swiecki, Z., Ruis, A. R., & Shaffer, D." */
  authors: string;
  year: number;
  title: string;
  /** Journal, or the book and its editors. */
  venue: string;
  pages?: string;
  /** Without the https://doi.org/ prefix. */
  doi?: string;
  openAccess?: boolean;
  /** One sentence on why it is here. */
  note?: string;
}

/** The team building the platform: to be added. */
export const TEAM: TeamMember[] = [
  { name: null, role: null, affiliation: null },
  { name: null, role: null, affiliation: null },
  { name: null, role: null, affiliation: null },
];

/** Papers the team publishes: to be added. */
export const OUR_PAPERS: Paper[] = [];

/** How many empty places "Our papers" shows until it has entries. */
export const OUR_PAPERS_PLACES = 2;

/** The method the platform runs, and the guide its interpretation follows. */
export const METHOD_PAPERS: Paper[] = [
  {
    authors: "Tan, Y., Swiecki, Z., Ruis, A. R., & Shaffer, D.",
    year: 2024,
    title: "Epistemic network analysis and ordered network analysis in learning analytics",
    venue: "In M. Saqr & S. López-Pernas (Eds.), Learning analytics methods and tutorials (Springer)",
    pages: "pp. 569–636",
    doi: "10.1007/978-3-031-54464-4_18",
    openAccess: true,
    note: "A step-by-step tutorial on the method, from coded data to networks, statistics and interpretation.",
  },
  {
    authors: "Shaffer, D. W., Collier, W., & Ruis, A. R.",
    year: 2016,
    title:
      "A tutorial on epistemic network analysis: Analyzing the structure of connections in cognitive, social, and interaction data",
    venue: "Journal of Learning Analytics, 3(3)",
    pages: "pp. 9–45",
    doi: "10.18608/jla.2016.33.3",
    openAccess: true,
    note: "One of the two sources pyENA's interpretation guide follows.",
  },
  {
    authors: "Shaffer, D. W., & Ruis, A. R.",
    year: 2017,
    title: "Epistemic network analysis: A worked example of theory-based learning analytics",
    venue: "In C. Lang, G. Siemens, A. Wise, & D. Gašević (Eds.), Handbook of learning analytics (SoLAR)",
    pages: "pp. 175–187",
    doi: "10.18608/hla17.015",
    openAccess: true,
    note: "The other source pyENA's interpretation guide follows.",
  },
];

/**
 * Who to write to about privacy, the terms or an account: to be added. While
 * it is null, the Privacy Policy and Terms say the address is to be added.
 */
export const CONTACT_EMAIL: string | null = null;

/** The date the Privacy Policy and Terms of Service were last changed. */
export const LEGAL_UPDATED = "2 October 2026";
