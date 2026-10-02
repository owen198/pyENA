#!/usr/bin/env python3
"""Write the first-time tutorial's example dataset (public/samples/).

    python3 scripts/build-tutorial-data.py

"Student experiences of online learning": four focus groups, two of
part-time and two of full-time students, four students each. Every line of
talk is a sentence written for this example, and its codes are the ideas
that sentence mentions, so the text and the codes always agree. The four
lines the tutorial brief quotes open the first sessions.

The data is made up for teaching, and says so in the platform. The two groups
are given different habits on purpose (part-time students tie flexibility to
recordings; full-time students tie isolation to live discussion and
motivation), so the analysis has a clear difference to find.

Standard library only, fixed seed: running it again writes identical files.
`--check` also runs native pyENA on the result (needs numpy and scipy).
"""

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "samples"
DATA = OUT / "online_learning.csv"
CODEBOOK = OUT / "online_learning_codebook.csv"

CODES = ["Flexibility", "Recordings", "Live_Discussion", "Isolation", "Motivation", "Group_Work"]
MEANINGS = {
    "Flexibility": "flexible study time and place",
    "Recordings": "recorded lectures",
    "Live_Discussion": "live discussion",
    "Isolation": "feeling isolated",
    "Motivation": "staying motivated",
    "Group_Work": "group projects",
}

# Sentences, keyed by the ideas they mention.
POOLS: dict[tuple[str, ...], list[str]] = {
    ("Flexibility", "Recordings"): [
        "Recorded lectures meant I could study after my shift.",
        "Watching the lectures at night fitted around my job.",
        "I paused the recordings and went at my own pace, which suited my week.",
        "I could replay a lecture on the train or at lunch.",
        "Having everything recorded meant I never missed a class because of work.",
    ],
    ("Flexibility",): [
        "Flexible schedules made online learning easier for me.",
        "Studying from home saved me two hours of commuting a day.",
        "I could fit coursework around my family.",
        "Not having to travel to campus was a big relief.",
    ],
    ("Recordings",): [
        "The recorded lectures were really useful for revision.",
        "I rewatched the hard parts of the lectures several times.",
    ],
    ("Flexibility", "Motivation"): [
        "The freedom was nice, but I had to be strict with myself to get work done.",
        "Setting my own timetable helped me stay on track.",
        "Some days the flexibility made it too easy to put things off.",
    ],
    ("Flexibility", "Group_Work"): [
        "Group projects were hard to coordinate around our work schedules.",
        "Everyone was free at different times, so the group project dragged on.",
    ],
    ("Isolation", "Live_Discussion"): [
        "Live discussions were the only time I felt connected to the class.",
        "Without the live sessions I would have felt completely on my own.",
        "In live discussions most cameras were off, so it still felt lonely.",
        "I missed the small talk before and after the live seminars.",
        "The live sessions were too short to really get to know anyone.",
    ],
    ("Isolation", "Motivation"): [
        "Studying alone at home, it was hard to stay motivated.",
        "Without classmates around I found it difficult to keep going.",
        "I missed people, and my motivation dropped with it.",
        "Nobody noticed if I skipped a week, so sometimes I did.",
    ],
    ("Isolation",): [
        "Lack of interaction made it hard to make friends.",
        "Some weeks I didn't speak to anyone from the course.",
    ],
    ("Live_Discussion",): [
        "I liked asking questions in the live seminars.",
        "The live Q&A sessions cleared up a lot for me.",
    ],
    ("Group_Work", "Live_Discussion"): [
        "Our group met in live calls, which made the project easier.",
        "We talked the project through on a video call every week.",
    ],
    ("Group_Work", "Isolation"): [
        "Working on the group project online felt isolating.",
        "I barely knew my group members, so the project felt lonely.",
    ],
    ("Group_Work", "Motivation"): [
        "The group chat kept me motivated when deadlines got close.",
        "Knowing my group depended on me kept me working.",
    ],
}
FILLERS = ["Yes, same here.", "I agree with that.", "That's true for me too.", "Good point.", "Mostly, yes."]

# What each group tends to talk about: the difference the analysis should find.
HABITS = {
    "Part-time": {
        ("Flexibility", "Recordings"): 0.30,
        ("Flexibility",): 0.15,
        ("Recordings",): 0.08,
        ("Flexibility", "Group_Work"): 0.14,
        ("Flexibility", "Motivation"): 0.12,
        ("Group_Work", "Live_Discussion"): 0.06,
        ("Isolation", "Live_Discussion"): 0.06,
        ("Isolation", "Motivation"): 0.05,
        ("Live_Discussion",): 0.04,
    },
    "Full-time": {
        ("Isolation", "Live_Discussion"): 0.26,
        ("Isolation", "Motivation"): 0.20,
        ("Isolation",): 0.08,
        ("Live_Discussion",): 0.09,
        ("Group_Work", "Live_Discussion"): 0.09,
        ("Group_Work", "Isolation"): 0.08,
        ("Group_Work", "Motivation"): 0.07,
        ("Flexibility", "Motivation"): 0.07,
        ("Flexibility",): 0.06,
    },
}

# The four lines from the tutorial brief, each with the ideas it mentions.
OPENERS = {
    "P01": ("Flexible schedules made online learning easier, but lack of interaction made discussions harder.",
            ("Flexibility", "Isolation", "Live_Discussion")),
    "P02": ("I enjoyed studying from home, but found it difficult to stay motivated.", ("Flexibility", "Motivation")),
    "P03": ("Recorded lectures were useful, while live discussions helped me feel connected.",
            ("Recordings", "Live_Discussion")),
    "P04": ("Online learning saved commuting time, but group projects were more difficult.", ("Flexibility", "Group_Work")),
}

SESSIONS = [
    ("Focus group 1", "Part-time", ["P01", "P04", "P05", "P06"]),
    ("Focus group 2", "Part-time", ["P07", "P08", "P09", "P10"]),
    ("Focus group 3", "Full-time", ["P02", "P03", "P11", "P12"]),
    ("Focus group 4", "Full-time", ["P13", "P14", "P15", "P16"]),
]
LINES_PER_SESSION = 28
FILLER_SHARE = 0.15


def build(rng: random.Random) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for session, group, people in SESSIONS:
        used: set[str] = set()
        # Each student leans their own way within the group's habits.
        leanings = {person: {motif: weight * rng.uniform(0.6, 1.4) for motif, weight in HABITS[group].items()} for person in people}
        lines: list[tuple[str, str, tuple[str, ...]]] = []
        for person in people:
            if person in OPENERS:
                lines.append((person, *OPENERS[person]))
        while len(lines) < LINES_PER_SESSION:
            person = rng.choice(people)
            if rng.random() < FILLER_SHARE:
                lines.append((person, rng.choice(FILLERS), ()))
                continue
            weights = leanings[person]
            motif = rng.choices(list(weights), list(weights.values()))[0]
            fresh = [sentence for sentence in POOLS[motif] if sentence not in used] or POOLS[motif]
            sentence = rng.choice(fresh)
            used.add(sentence)
            lines.append((person, sentence, motif))
        for number, (person, text, codes) in enumerate(lines, start=1):
            row = {"Enrollment": group, "Session": session, "Participant": person, "Line": str(number), "Text": text}
            row.update({code: "1" if code in codes else "0" for code in CODES})
            rows.append(row)
    return rows


def main() -> None:
    rows = build(random.Random(20261002))
    header = ["Enrollment", "Session", "Participant", "Line", "Text", *CODES]
    with DATA.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)
    with CODEBOOK.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["code", "meaning"])
        writer.writerows([code, MEANINGS[code]] for code in CODES)
    print(f"wrote {DATA.relative_to(ROOT)} ({len(rows)} rows) and {CODEBOOK.relative_to(ROOT)}")
    if "--check" in sys.argv:
        check(rows)


def check(rows: list[dict[str, str]]) -> None:
    """Run native pyENA on the file with the tutorial's configuration, in 2D and 3D."""
    sys.path.insert(0, str(next((ROOT / "public" / "py").glob("pyena-*.zip"))))
    from pyena import accumulate_data, group_network, group_points, make_set, subtract_networks, summarize_ena_results

    groups = ("Full-time", "Part-time")
    enadata = accumulate_data(
        data=rows, codes=CODES, units=["Enrollment", "Participant"], conversation=["Session"],
        metadata=["Enrollment"], model="EndPoint", window="MovingStanzaWindow", window_size_back=4, window_size_forward=0,
    )
    for dimensions in (2, 3):
        ena_set = make_set(enadata=enadata, dimensions=dimensions, rotation="mean", group_column="Enrollment", groups=groups)
        a, b = (group_network(ena_set, "Enrollment", g) for g in groups)
        summary = summarize_ena_results(
            ena_set=ena_set, group_a_label=groups[0], group_b_label=groups[1], group_column="Enrollment",
            group_a_points=group_points(ena_set, "Enrollment", groups[0]),
            group_b_points=group_points(ena_set, "Enrollment", groups[1]),
            group_a_network=a, group_b_network=b, subtracted_mean_network=subtract_networks(a, b),
        )
        welch = summary["statistics"]["welch_t_test"]["dimension_1"]
        top = summary["networks"]["subtracted_mean_network_top_edges"]
        print(f"{dimensions}D: Welch t = {welch['t_statistic']:.2f}, p = {welch['p_value']:.4g}, d = {welch['cohens_d']:.2f}")
        print("   stronger for Full-time:", top["group_a_stronger"][0]["edge"], "/ Part-time:", top["group_b_stronger"][0]["edge"])


if __name__ == "__main__":
    main()
