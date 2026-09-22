"""案例一：逐段 0–3 評分 → 構面 × 等級的二元代碼 → ENA。

執行：python3 case1.py
以下全為模擬的已編碼資料，不是對真實文本的自動判碼。

預設讀取 datasets 中的 CSV；--regenerate-data 重新產生模擬資料。
"""
from pathlib import Path
import csv
import argparse
from random import Random
import json
import os
import tempfile

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "gender_ena_mpl"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from pyena import (accumulate_data, ena, create_network_plot, generate_analysis_outputs,
                   group_network, group_points, summarize_ena_results)


GROUPS = ("A", "B")


def build_parser(description):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--summary-only", action="store_true", help="輸出資料與統計摘要，略過繪圖。")
    parser.add_argument("--group-seed", type=int, default=20260922, help="以聊天為單位隨機分群的種子。")
    parser.add_argument("--regenerate-data", action="store_true", help="重新生成 200 筆模擬資料並依 group-seed 分群。")
    return parser


def assign_groups(rows, seed):
    """隨機平衡分配聊天；獨立亂數產生器，不改變原始編碼。"""
    sessions = sorted({r["session_id"] for r in rows})
    Random(seed).shuffle(sessions)
    groups = {session: GROUPS[i % 2] for i, session in enumerate(sessions)}
    return [{**r, "group": groups[r["session_id"]]} for r in rows]


def save_csv(path, records):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)


def run_ena(records, codes, output_dir, window_size=1, summary_only=False, group_seed=20260922):
    """每列一段文字；每個 session_id 一張網絡；episode_id 限制共現邊界。"""
    records = sorted(records, key=lambda r: (r["session_id"], r["episode_id"], int(r["order"])))
    if len({(r["session_id"], r["episode_id"], int(r["order"])) for r in records}) != len(records):
        raise ValueError("同一聊天事件內的 order 不可重複。")
    if any(r[c] not in (0, 1) for r in records for c in codes):
        raise ValueError("本範例要求 codes 欄位為整數 0 或 1。")
    session_groups = {}
    for row in records:
        group = row.get("group")
        if group not in GROUPS:
            raise ValueError("group 必須為 A 或 B。")
        previous = session_groups.setdefault(row["session_id"], group)
        if previous != group:
            raise ValueError("同一次聊天不可跨群。")
    if any(list(session_groups.values()).count(g) < 2 for g in GROUPS):
        raise ValueError("每群至少需要兩次聊天。")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    save_csv(DATA / "binary_input.csv", records)
    settings = dict(
        codes=codes,
        metadata=["group"],
        units=["session_id"],                 # 網絡單位：一次聊天
        conversation=["session_id", "episode_id"], # 不跨聊天／事件連線
        model="EndPoint",
        window="MovingStanzaWindow",
        window_size_back=window_size,          # 1：只算本段；3：本段＋前兩段
        window_size_forward=0,
    )
    accumulated = accumulate_data(data=records, **settings)
    save_csv(out / "edge_counts.csv", [
        {"session_id": label, "group": session_groups[label], **dict(zip(accumulated.edge_labels, vector.tolist()))}
        for label, vector in zip(accumulated.unit_labels, accumulated.accumulated_vectors)
    ])
    zero_units = [label for label, v in zip(accumulated.unit_labels, accumulated.accumulated_vectors)
                  if not np.any(v)]
    if zero_units:
        raise ValueError(f"以下聊天沒有共現邊，已輸出計數供檢查，停止建模：{zero_units}")

    # 對照 example.py，以群組平均旋轉並產生兩群比較。
    model = ena(data=records, rotation="mean", group_column="group",
                groups=GROUPS, dimensions=2, **settings)
    if model.points.shape[1] < 2 or not np.isfinite(model.points).all():
        raise ValueError("資料不足以形成有效的二維 ENA 座標。")
    save_csv(out / "points.csv", [
        {"session_id": label, "group": session_groups[label], "ENA1": float(p[0]), "ENA2": float(p[1])}
        for label, p in zip(model.unit_labels, model.points)
    ])
    if summary_only:
        a_network = group_network(model, "group", GROUPS[0])
        b_network = group_network(model, "group", GROUPS[1])
        summary = summarize_ena_results(
            ena_set=model, group_column="group", group_a_label=GROUPS[0], group_b_label=GROUPS[1],
            group_a_points=group_points(model, "group", GROUPS[0]),
            group_b_points=group_points(model, "group", GROUPS[1]),
            group_a_network=a_network, group_b_network=b_network,
            subtracted_mean_network=a_network - b_network,
        )
        outputs = {"generated_files": ["statistical_summary.json"]}
    else:
        outputs = generate_analysis_outputs(
            ena_set=model, output_dir=out, group_column="group",
            group_a_label=GROUPS[0], group_b_label=GROUPS[1],
            group_a_color="#ff0000", group_b_color="#0000ff",
            group_a_line_colors=("#ff0000", "#ff0000"),
            group_b_line_colors=("#0000ff", "#0000ff"),
            subtracted_line_colors=("#ff0000", "#0000ff"),
            focus_unit_a=next(s for s in model.unit_labels if session_groups[s] == GROUPS[0]),
            focus_unit_b=next(s for s in model.unit_labels if session_groups[s] == GROUPS[1]),
        )
        summary = outputs["analysis_summary"]
        fig, _ = create_network_plot(
            model, model.line_weights.mean(axis=0), title="Synthetic example: mean ENA network"
        )
        fig.savefig(out / "mean_network.png", dpi=180, bbox_inches="tight")
        plt.close(fig)
        fig, ax = plt.subplots(figsize=(7, 6))
        for group, color in zip(GROUPS, ("#ff0000", "#0000ff")):
            points = group_points(model, "group", group)
            ax.scatter(points[:, 0], points[:, 1], c=color, label=group)
        ax.legend()
        for label, p in zip(model.unit_labels, model.points):
            ax.annotate(label, p, fontsize=7)
        ax.set(xlabel="ENA1", ylabel="ENA2", title="Synthetic example: one point per chat session")
        fig.tight_layout()
        fig.savefig(out / "points.png", dpi=180)
        plt.close(fig)
    summary["data_context"] = {
        "synthetic_data": True, "group_seed": group_seed,
        "group_assignment": "Balanced random assignment by session_id",
        "interpretation": "Demonstration only; random groups do not represent substantive populations.",
    }
    (out / "statistical_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / "settings.json").write_text(json.dumps({
        **settings, "synthetic_data": True, "n_sessions": len(model.unit_labels),
        "n_segments": len(records), "rotation": "mean", "groups": GROUPS, "group_column": "group",
        "group_seed": group_seed, "summary_only": summary_only,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Group session counts:", {g: list(session_groups.values()).count(g) for g in GROUPS})
    print("Generated:", outputs["generated_files"])
    print(f"完成：{out.resolve()}")
    return model


def load_csv(path, numeric_columns):
    """讀取既有資料，保留人工修改及分群；缺失值不當作 0。"""
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError(f"輸入資料為空：{path}")
    for row in rows:
        for column in ["order", *numeric_columns]:
            row[column] = int(row[column])
    return rows


DIMENSIONS = {"expectation": "性別期望", "friendliness": "性別友善", "violence": "性別暴力"}
CODES = [f"{dimension}_L{level}" for dimension in DIMENSIONS for level in (1, 2, 3)]
BASE = Path(__file__).resolve().parent
DATA = BASE / "datasets" / "case1"
OUT = BASE / "outputs" / "case1"


def encode_levels(rows):
    result = []
    for row in rows:
        record = {key: row[key] for key in ("session_id", "episode_id", "order", "group")}
        for dimension in DIMENSIONS:
            value = row[dimension]
            # 缺失值不可當成 0；本例的 0 是明確判為不相關。
            if type(value) is not int or value not in (0, 1, 2, 3):
                raise ValueError(f"{dimension} 必須是 0–3 整數，收到 {value!r}")
            for level in (1, 2, 3):
                record[f"{dimension}_L{level}"] = int(value == level)
        result.append(record)
    return result


def demo_rows():
    rng = Random(20260921)
    rows = []
    # 20 次聊天 × 每次 10 段＝200 筆模擬資料。
    for session in range(1, 21):
        for order in range(1, 11):
            rows.append({
                "session_id": f"S{session:02d}", "episode_id": "E1", "order": order,
                **{d: rng.choices([0, 1, 2, 3], weights=[1, 3, 3, 3])[0] for d in DIMENSIONS},
            })
    # 對應討論中的具體例子：期望＝2、友善＝1、暴力＝0。
    rows[0].update(expectation=2, friendliness=1, violence=0)
    return rows


def main():
    args = build_parser(__doc__).parse_args()
    input_path = DATA / "original_levels.csv"
    if args.regenerate_data or not input_path.exists():
        original = assign_groups(demo_rows(), args.group_seed)
        save_csv(input_path, original)
    else:
        original = load_csv(input_path, list(DIMENSIONS))
    binary = encode_levels(original)
    save_csv(DATA / "codebook.csv", [
        {"code": f"{d}_L{level}", "meaning": f"{name}：level {level}"}
        for d, name in DIMENSIONS.items() for level in (1, 2, 3)
    ])
    run_ena(binary, CODES, OUT, window_size=1,
            summary_only=args.summary_only, group_seed=args.group_seed if args.regenerate_data else None)


if __name__ == "__main__":
    main()
