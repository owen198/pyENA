// What the landing page says about the people and the papers. Edit this file
// to fill it in; the page lays out whatever is here. A null field shows as
// "To be added", so nothing is ever invented to fill a gap.

export interface TeamMember {
  name: string | null;
  role: string | null;
  /** Shown under the role when set; left out otherwise. */
  affiliation?: string | null;
  /** A few sentences about them, in their own words; shown when set, never invented to fill the space. */
  bio?: string;
  /** A portrait in public/people, as "/people/name.jpg"; optional. */
  photo?: string;
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
  /** Where to read it when there is no DOI. */
  url?: string;
  openAccess?: boolean;
  /** One sentence on why it is here. */
  note?: string;
}

/** Where everyone on the team is from. */
export const NCCU = "National Chengchi University";

/** The team building the platform, in the order the Team page introduces them. */
export const TEAM: TeamMember[] = [
  { name: "Owen (Hsin-Tse) Lu", role: "Co-founder & CEO", affiliation: NCCU, photo: "/people/owen.jpg" },
  { name: "Nessa (Linh Nhi) Hoang", role: "Co-founder & Product CTO", affiliation: NCCU, photo: "/people/nessa.jpg" },
  { name: "Susan Milagros Dávalos Vega", role: "Co-founder & CPO", affiliation: NCCU, photo: "/people/susan.jpg" },
  { name: "Ruby (Chin-Ju) Lin", role: "Co-founder & Technical Support Lead", affiliation: NCCU, photo: "/people/ruby.jpg" },
  { name: "Joe K.Z. CHUANG", role: "Business Development", affiliation: NCCU, photo: "/people/joe.jpg" },
];

/** The team's own papers, the only ones the Papers page shows. */
export const OUR_PAPERS: Paper[] = [
  {
    authors: "Lu, O. H. T., & Hsu, T. T. Y.",
    year: 2026,
    title: "TopicENA: Enabling epistemic network analysis at scale through automated topic-based coding",
    venue: "arXiv preprint arXiv:2603.03307",
    doi: "10.48550/arXiv.2603.03307",
    openAccess: true,
  },
  {
    authors: "Dávalos Vega, S. M., Chuang, K.-Z., Lopez Lorenzana, M. M., Tseng, Y., & Lu, O. H. T.",
    year: 2026,
    title: "The influence of digital self-efficacy on students' learning outcomes in a programming course",
    venue: "ICLEA 2026: 2nd International Conference on Learning Evidence and Analytics",
    url: "https://library.apsce.net/index.php/ICLEA/article/view/6307",
  },
];

/**
 * Who to write to about privacy, the terms or an account: to be added. While
 * it is null, the Privacy Policy and Terms say the address is to be added.
 */
export const CONTACT_EMAIL: string | null = null;

/** The date the Privacy Policy and Terms of Service were last changed. */
export const LEGAL_UPDATED = "2 October 2026";
