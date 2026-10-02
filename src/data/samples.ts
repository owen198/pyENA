// The example datasets that ship with pyENA, each with the configuration its
// own example script uses. The configuration is offered, never auto-applied.

import type { ModelConfig } from "../model/config";

export interface Sample {
  id: string;
  file: string;
  name: string;
  description: string;
  /** Size facts shown beside the example, checked against the file. */
  facts: string;
  /** The script in the pyENA repository whose ena() call the preset reproduces. */
  script: string;
  preset: ModelConfig;
  /** The two units the script draws its individual comparison for. */
  focus?: [string, string];
  /** The codebook the example ships with in the pyENA repository, when it has one. */
  schema?: string;
  /** Made for the first-time tutorial, not from the pyENA repository: kept out of the example lists. */
  tutorial?: boolean;
}

const RS_CODES = [
  "Data",
  "Technical.Constraints",
  "Performance.Parameters",
  "Client.and.Consultant.Requests",
  "Design.Reasoning",
  "Collaboration",
];

export const SAMPLES: Sample[] = [
  {
    id: "rs",
    file: "samples/RS.data.csv",
    name: "RS.data",
    description: "rENA handbook data, FirstGame vs SecondGame",
    facts: "3,824 rows / 6 codes / 48 units",
    script: "examples/rs/example.py",
    preset: {
      codes: [
        "Data",
        "Technical.Constraints",
        "Performance.Parameters",
        "Client.and.Consultant.Requests",
        "Design.Reasoning",
        "Collaboration",
      ],
      units: ["Condition", "UserName"],
      conversation: ["Condition", "GroupName"],
      metadata: ["Condition", "GroupName"],
      window: "MovingStanzaWindow",
      windowBack: 4,
      windowForward: 0,
      rotation: "mean",
      dimensions: 2,
      groupColumn: "Condition",
      groups: ["FirstGame", "SecondGame"],
    },
    focus: ["FirstGame::steven z", "SecondGame::samuel o"],
  },
  {
    id: "rs-3d",
    file: "samples/RS.data.csv",
    name: "RS.data in 3D",
    description: "The same data with a Z axis: 3D networks you can rotate",
    facts: "3,824 rows / 6 codes / 48 units / 3 dimensions",
    script: "examples/rs/example_3d.py",
    preset: {
      codes: RS_CODES,
      units: ["Condition", "UserName"],
      conversation: ["Condition", "GroupName"],
      metadata: ["Condition", "GroupName"],
      window: "MovingStanzaWindow",
      windowBack: 4,
      windowForward: 0,
      rotation: "mean",
      dimensions: 3,
      groupColumn: "Condition",
      groups: ["FirstGame", "SecondGame"],
    },
    focus: ["FirstGame::steven z", "SecondGame::samuel o"],
  },
  {
    id: "gender-case1",
    file: "samples/gender_case1_binary_input.csv",
    schema: "samples/gender_case1_codebook.csv",
    name: "Gender ENA, case 1",
    description: "Simulated rating levels, 20 chats in groups A and B",
    facts: "200 rows / 9 codes / 20 units",
    script: "examples/gender_ena/case1.py",
    preset: {
      codes: [
        "expectation_L1",
        "expectation_L2",
        "expectation_L3",
        "friendliness_L1",
        "friendliness_L2",
        "friendliness_L3",
        "violence_L1",
        "violence_L2",
        "violence_L3",
      ],
      units: ["session_id"],
      conversation: ["session_id", "episode_id"],
      metadata: ["group"],
      window: "MovingStanzaWindow",
      windowBack: 1,
      windowForward: 0,
      rotation: "mean",
      dimensions: 2,
      groupColumn: "group",
      groups: ["A", "B"],
    },
  },
  {
    id: "gender-case2",
    file: "samples/gender_case2_binary_input.csv",
    schema: "samples/gender_case2_codebook.csv",
    name: "Gender ENA, case 2",
    description: "Simulated topic codes, 20 chats in groups A and B",
    facts: "200 rows / 6 codes / 20 units",
    script: "examples/gender_ena/case2.py",
    preset: {
      codes: [
        "motor_masculinity",
        "labor_masculinity",
        "gendered_swearing",
        "minority_exclusion",
        "gender_double_standard",
        "teacher_counterexample",
      ],
      units: ["session_id"],
      conversation: ["session_id", "episode_id"],
      metadata: ["group"],
      window: "MovingStanzaWindow",
      windowBack: 1,
      windowForward: 0,
      rotation: "mean",
      dimensions: 2,
      groupColumn: "group",
      groups: ["A", "B"],
    },
  },
  {
    id: "online-learning",
    file: "samples/online_learning.csv",
    schema: "samples/online_learning_codebook.csv",
    name: "Student experiences of online learning",
    description: "Example made for the tutorial: four focus groups, part-time and full-time students",
    facts: "112 rows / 6 codes / 16 units",
    script: "scripts/build-tutorial-data.py",
    tutorial: true,
    preset: {
      codes: ["Flexibility", "Recordings", "Live_Discussion", "Isolation", "Motivation", "Group_Work"],
      units: ["Enrollment", "Participant"],
      conversation: ["Session"],
      metadata: ["Enrollment"],
      window: "MovingStanzaWindow",
      windowBack: 4,
      windowForward: 0,
      rotation: "mean",
      dimensions: 2,
      groupColumn: "Enrollment",
      groups: ["Full-time", "Part-time"],
    },
  },
];

/** The examples from the pyENA repository, as the example lists show them. */
export const REPOSITORY_SAMPLES = SAMPLES.filter((sample) => !sample.tutorial);

/** The tutorial's own example. */
export const TUTORIAL_SAMPLE = SAMPLES.find((sample) => sample.tutorial)!;

async function fetchPublic(path: string, what: string): Promise<File> {
  const response = await fetch(new URL(import.meta.env.BASE_URL + path, location.href));
  if (!response.ok) throw new Error(`${what} could not be loaded (${response.status}).`);
  return new File([await response.blob()], path.split("/").pop()!, { type: "text/csv" });
}

export function fetchSample(sample: Sample): Promise<File> {
  return fetchPublic(sample.file, `The ${sample.name} example`);
}

export function fetchSampleSchema(sample: Sample): Promise<File> | null {
  return sample.schema ? fetchPublic(sample.schema, `The coding schema of the ${sample.name} example`) : null;
}
