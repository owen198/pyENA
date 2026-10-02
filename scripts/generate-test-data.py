#!/usr/bin/env python3
"""Generate synthetic coded datasets for trying the platform (test-data/).

Standard library only, fixed seed: running it again writes identical files.

  python3 scripts/generate-test-data.py

Each line of talk is coded from a "motif" (a set of codes that tend to occur
together). A unit's mix of motifs sets the shape of its network, so the
differences the platform should find are built in on purpose:

- collab_2d.csv: the two conditions differ on one strong direction, which
  2D shows clearly.
- clinical_sim_3d.csv: experience level drives one direction, and two
  independent individual styles drive two more, so dimension 3 carries real
  variance and the 3D view shows spread along Z.
- edge_cases.csv: semicolon-delimited, mixed code spellings and deliberate
  problems that the platform's validation should catch.
"""

from __future__ import annotations

import csv
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "test-data"
PYENA_COMMIT = "ed788e0"


def pick_motif(weights: dict[str, float], rng: random.Random) -> str:
    names = list(weights)
    return rng.choices(names, [weights[name] for name in names])[0]


def dirichlet(alphas: list[float], rng: random.Random) -> list[float]:
    draws = [rng.gammavariate(alpha, 1.0) for alpha in alphas]
    total = sum(draws)
    return [draw / total for draw in draws]


def code_line(
    motif: str | None,
    motifs: dict[str, list[str]],
    codes: list[str],
    rng: random.Random,
    noise: float = 0.04,
) -> dict[str, int]:
    """One line: 1–2 codes from the motif, plus rare background noise."""
    row = {code: 0 for code in codes}
    if motif is not None:
        members = motifs[motif]
        for code in rng.sample(members, rng.choice([1, 1, 2])):
            row[code] = 1
    for code in codes:
        if rng.random() < noise:
            row[code] = 1
    return row


def conversation(
    speakers: list[tuple[str, dict[str, float]]],
    lines: int,
    motifs: dict[str, list[str]],
    codes: list[str],
    rng: random.Random,
    uncoded: float = 0.25,
    stickiness: float = 0.55,
):
    """Yield (speaker, codes) lines. Talk stays on a motif for a while, so
    co-occurrences inside the stanza window follow the speakers' motifs."""
    motif = None
    for _ in range(lines):
        speaker, weights = rng.choice(speakers)
        if motif is None or rng.random() > stickiness:
            motif = pick_motif(weights, rng)
        yield speaker, code_line(None if rng.random() < uncoded else motif, motifs, codes, rng)


def write_csv(path: Path, header: list[str], rows: list[dict], delimiter: str = ",") -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=header, delimiter=delimiter)
        writer.writeheader()
        writer.writerows(rows)


def write_config(path: Path, file_name: str, columns: list[str], model: dict) -> None:
    config = {
        "format": "pyena-platform-config",
        "version": 1,
        "pyena": PYENA_COMMIT,
        "source": {"fileName": file_name, "columns": columns},
        "model": model,
    }
    path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. collab_2d.csv — two instructional conditions, 40 students
# ---------------------------------------------------------------------------

FIRST_NAMES = [
    "an", "binh", "chi", "dung", "giang", "hai", "hoa", "khanh", "lan", "linh",
    "minh", "nam", "ngoc", "phuc", "quan", "son", "thao", "trang", "tuan", "vy",
    "alex", "maya", "omar", "sofia", "leo", "nina", "ravi", "ella", "noah", "ivy",
    "sam", "zoe", "eli", "mia", "kai", "ana", "ben", "lea", "tom", "uma",
    "jin", "yuki", "ada", "max", "eva", "luca", "ines", "theo", "ria", "dev",
    "oli", "ema", "raf", "tia", "hugo", "lina", "otto", "amy", "ken", "sara",
    "pau", "ida", "remy", "noa", "ari", "juno", "sol", "kira", "milo", "nia",
]


def collab_2d(rng: random.Random) -> None:
    codes = ["Questioning", "Explaining", "Evidence", "Planning", "Evaluating", "Off_Task"]
    motifs = {
        "reasoning": ["Explaining", "Evidence", "Evaluating"],
        "managing": ["Planning", "Questioning", "Off_Task"],
        "inquiry": ["Questioning", "Explaining"],
    }
    # Scaffolded students lean on reasoning, unscaffolded ones on managing.
    base = {
        "Scaffolded": {"reasoning": 0.58, "managing": 0.17, "inquiry": 0.25},
        "Unscaffolded": {"reasoning": 0.20, "managing": 0.55, "inquiry": 0.25},
    }
    header = ["condition", "team", "student", "activity", "line", "utterance", *codes]
    rows = []
    names = iter(FIRST_NAMES)
    for condition, team_names in [
        ("Scaffolded", ["Aurora", "Birch", "Cedar", "Delta", "Ember"]),
        ("Unscaffolded", ["Fjord", "Grove", "Harbor", "Iris", "Juniper"]),
    ]:
        for team in team_names:
            students = []
            for _ in range(4):
                name = next(names)
                jitter = dirichlet([6, 6, 6], rng)
                weights = {
                    motif: 0.75 * base[condition][motif] + 0.25 * j
                    for motif, j in zip(motifs, jitter)
                }
                students.append((name, weights))
            line = 0
            for activity in (1, 2, 3):
                for speaker, coded in conversation(students, 40, motifs, codes, rng):
                    line += 1
                    present = [code for code in codes if coded[code]]
                    rows.append({
                        "condition": condition,
                        "team": team,
                        "student": speaker,
                        "activity": activity,
                        "line": line,
                        "utterance": f"({', '.join(present) or 'uncoded'})",
                        **coded,
                    })
    write_csv(OUT / "collab_2d.csv", header, rows)
    write_config(OUT / "collab_2d.config.json", "collab_2d.csv", header, {
        "codes": codes,
        "units": ["condition", "student"],
        "conversation": ["team", "activity"],
        "metadata": ["team"],
        "window": "MovingStanzaWindow",
        "windowBack": 4,
        "windowForward": 0,
        "rotation": "svd",
        "dimensions": 2,
        "groupColumn": "condition",
        "groups": ["Scaffolded", "Unscaffolded"],
    })


# ---------------------------------------------------------------------------
# 2. clinical_sim_3d.csv — three experience levels, 72 participants
# ---------------------------------------------------------------------------


def clinical_sim_3d(rng: random.Random) -> None:
    codes = [
        "Assessment", "Vital_Signs", "Diagnosis", "Treatment",
        "Medication_Safety", "Team_Communication", "Escalation", "Patient_Education",
    ]
    motifs = {
        # Axis 1, set by experience: clinical reasoning vs task-and-escalate.
        "reasoning": ["Assessment", "Diagnosis", "Treatment"],
        "task": ["Vital_Signs", "Escalation", "Team_Communication"],
        # Axes 2 and 3, individual styles independent of experience.
        "safety": ["Medication_Safety", "Treatment", "Patient_Education"],
        "handoff": ["Team_Communication", "Patient_Education", "Escalation"],
        "monitoring": ["Vital_Signs", "Assessment", "Medication_Safety"],
    }
    reasoning_share = {"Novice": 0.15, "Intermediate": 0.30, "Expert": 0.48}
    header = [
        "participant", "experience", "team", "scenario", "shift",
        "turn", "timestamp", *codes,
    ]
    rows = []
    number = 0
    for experience in ("Novice", "Intermediate", "Expert"):
        for team_index in range(1, 7):
            team = f"{experience[0]}{team_index}"
            shift = "Day" if team_index % 2 else "Night"
            people = []
            for _ in range(4):
                number += 1
                r = reasoning_share[experience]
                style = dirichlet([0.8, 0.8, 0.8], rng)  # strong individual styles
                weights = {
                    "reasoning": r,
                    "task": 0.63 - r,
                    "safety": 0.37 * style[0] + 0.01,
                    "handoff": 0.37 * style[1] + 0.01,
                    "monitoring": 0.37 * style[2] + 0.01,
                }
                people.append((f"P{number:03d}", weights))
            for scenario in ("Sepsis", "Cardiac"):
                minute, second = 0, 0
                for turn, (speaker, coded) in enumerate(
                    conversation(people, 35, motifs, codes, rng, uncoded=0.2), start=1
                ):
                    second += rng.randint(5, 40)
                    minute, second = minute + second // 60, second % 60
                    rows.append({
                        "participant": speaker,
                        "experience": experience,
                        "team": team,
                        "scenario": scenario,
                        "shift": shift,
                        "turn": turn,
                        "timestamp": f"00:{minute:02d}:{second:02d}",
                        **coded,
                    })
    write_csv(OUT / "clinical_sim_3d.csv", header, rows)
    write_config(OUT / "clinical_sim_3d.config.json", "clinical_sim_3d.csv", header, {
        "codes": codes,
        "units": ["experience", "participant"],
        "conversation": ["team", "scenario"],
        "metadata": ["team", "shift"],
        "window": "MovingStanzaWindow",
        "windowBack": 3,
        "windowForward": 0,
        "rotation": "mean",
        "dimensions": 3,
        "groupColumn": "experience",
        "groups": ["Novice", "Expert"],
    })


# ---------------------------------------------------------------------------
# 3. edge_cases.csv — semicolon-delimited, for the validation messages
# ---------------------------------------------------------------------------


def edge_cases(rng: random.Random) -> None:
    codes = ["Idea", "Build_On", "Critique", "Agree", "Never_Coded"]
    header = ["arm", "group_id", "speaker", "turn", "score", "note", *codes]
    spellings = {1: ["1", "1.0", "yes", "TRUE", "y"], 0: ["0", "0.0", "no", "FALSE", ""]}
    rows = []
    speakers = [("Control", "G1", s) for s in ("ca", "cb", "cc")] + \
               [("Control", "G2", s) for s in ("cd", "ce", "cf")] + \
               [("Treatment", "G3", s) for s in ("ta", "tb", "tc")] + \
               [("Treatment", "G4", s) for s in ("td", "te", "tf")] + \
               [("Pilot", "G5", "pa")]
    by_group: dict[tuple[str, str], list[str]] = {}
    for arm, group, speaker in speakers:
        by_group.setdefault((arm, group), []).append(speaker)
    for (arm, group), members in by_group.items():
        for turn in range(1, 31):
            speaker = rng.choice(members)
            treatment = arm == "Treatment"
            present = {
                "Idea": rng.random() < 0.35,
                "Build_On": rng.random() < (0.40 if treatment else 0.12),
                "Critique": rng.random() < (0.30 if treatment else 0.10),
                "Agree": rng.random() < (0.15 if treatment else 0.40),
                "Never_Coded": False,
            }
            row = {
                "arm": arm, "group_id": group, "speaker": speaker, "turn": turn,
                "score": rng.randint(0, 5),
                "note": "NA" if rng.random() < 0.1 else rng.choice(["ok", "loud", "quiet"]),
            }
            for code in codes:
                value = rng.choice(spellings[int(present[code])])
                if code == "Idea" and rng.random() < 0.05:
                    value = "NA"  # missing values
                row[code] = value
            rows.append(row)
    write_csv(OUT / "edge_cases.csv", header, rows, delimiter=";")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    collab_2d(random.Random(20260926))
    clinical_sim_3d(random.Random(3))
    edge_cases(random.Random(7))
    for path in sorted(OUT.glob("*")):
        print(path.relative_to(OUT.parent))
