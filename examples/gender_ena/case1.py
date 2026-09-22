"""案例一：分析 10 個構面轉換後的 30 個二元代碼。

先執行 python3 case1_preprocess.py，再執行 python3 case1.py。
僅需統計與表格：python3 case1.py --summary-only
"""
from pathlib import Path
import argparse
import csv
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

from case1_preprocess import CODES


# 常用設定：資料、輸出、群組與共現視窗。
BASE = Path(__file__).resolve().parent
DATA = BASE / "datasets" / "case1"
OUT = BASE / "outputs" / "case1"
GROUPS = ("A", "B")
WINDOW_SIZE = 1  # 1：只算本段；3：本段與前兩段



def parse_args(description):
    parser = argparse.ArgumentParser(description=description, add_help=False)
    parser.add_argument("--summary-only", action="store_true", help="輸出統計摘要與表格，略過繪圖。")
    return parser.parse_args()


def save_csv(path, records):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)


def run_ena(records, codes, output_dir, window_size=1, summary_only=False, groups=("A", "B")):
    """每列一段文字；每個 session_id 一張網絡，亦為共現邊界。"""
    records = sorted(records, key=lambda r: (r["session_id"], int(r["order"])))
    if len({(r["session_id"], int(r["order"])) for r in records}) != len(records):
        raise ValueError("同一聊天內的 order 不可重複。")
    if any(r[c] not in (0, 1) for r in records for c in codes):
        raise ValueError("本範例要求 codes 欄位為整數 0 或 1。")
    session_groups = {}
    for row in records:
        group = row.get("group")
        if group not in groups:
            raise ValueError(f"group 必須為 {groups[0]} 或 {groups[1]}。")
        previous = session_groups.setdefault(row["session_id"], group)
        if previous != group:
            raise ValueError("同一次聊天不可跨群。")
    if any(list(session_groups.values()).count(g) < 2 for g in groups):
        raise ValueError("每群至少需要兩次聊天。")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    settings = dict(
        codes=codes,
        metadata=["group"],
        units=["session_id"],                 # 網絡單位：一次聊天
        conversation=["session_id"],          # 不跨聊天連線
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
                groups=groups, dimensions=2, **settings)
    if model.points.shape[1] < 2 or not np.isfinite(model.points).all():
        raise ValueError("資料不足以形成有效的二維 ENA 座標。")
    save_csv(out / "points.csv", [
        {"session_id": label, "group": session_groups[label], "ENA1": float(p[0]), "ENA2": float(p[1])}
        for label, p in zip(model.unit_labels, model.points)
    ])
    if summary_only:
        a_network = group_network(model, "group", groups[0])
        b_network = group_network(model, "group", groups[1])
        summary = summarize_ena_results(
            ena_set=model, group_column="group", group_a_label=groups[0], group_b_label=groups[1],
            group_a_points=group_points(model, "group", groups[0]),
            group_b_points=group_points(model, "group", groups[1]),
            group_a_network=a_network, group_b_network=b_network,
            subtracted_mean_network=a_network - b_network,
        )
        outputs = {"generated_files": ["statistical_summary.json"]}
    else:
        outputs = generate_analysis_outputs(
            ena_set=model, output_dir=out, group_column="group",
            group_a_label=groups[0], group_b_label=groups[1],
            group_a_color="#ff0000", group_b_color="#0000ff",
            group_a_line_colors=("#ff0000", "#ff0000"),
            group_b_line_colors=("#0000ff", "#0000ff"),
            subtracted_line_colors=("#ff0000", "#0000ff"),
            focus_unit_a=next(s for s in model.unit_labels if session_groups[s] == groups[0]),
            focus_unit_b=next(s for s in model.unit_labels if session_groups[s] == groups[1]),
        )
        summary = outputs["analysis_summary"]
        fig, _ = create_network_plot(
            model, model.line_weights.mean(axis=0), title="Synthetic example: mean ENA network"
        )
        fig.savefig(out / "mean_network.png", dpi=180, bbox_inches="tight")
        plt.close(fig)
        fig, ax = plt.subplots(figsize=(7, 6))
        for group, color in zip(groups, ("#ff0000", "#0000ff")):
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
        "synthetic_data": True,
        "group_assignment": "Balanced random assignment by session_id",
        "interpretation": "Demonstration only; random groups do not represent substantive populations.",
    }
    (out / "statistical_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out / "settings.json").write_text(json.dumps({
        **settings, "synthetic_data": True, "n_sessions": len(model.unit_labels),
        "n_segments": len(records), "rotation": "mean", "groups": groups, "group_column": "group",
        "summary_only": summary_only,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Group session counts:", {g: list(session_groups.values()).count(g) for g in groups})
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


def main():
    args = parse_args(__doc__)
    input_path = DATA / "binary_input.csv"
    if not input_path.exists():
        raise FileNotFoundError("找不到 binary_input.csv；請先執行 python3 case1_preprocess.py。")

    rows = load_csv(input_path, CODES)
    run_ena(rows, CODES, OUT, groups=GROUPS, window_size=WINDOW_SIZE,
            summary_only=args.summary_only)


if __name__ == "__main__":
    main()
