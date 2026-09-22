"""將 original_levels.csv 的 0–3 評分轉為 binary_input.csv。

python3 case1_preprocess.py
僅使用 Python 標準函式庫；不執行 ENA，也不產生圖片。
"""
from pathlib import Path
import argparse
import csv

BASE = Path(__file__).resolve().parent
DATA = BASE / "datasets" / "case1"
GROUPS = ("A", "B")
with (DATA / "codebook.csv").open(encoding="utf-8-sig", newline="") as handle:
    CODEBOOK = list(csv.DictReader(handle))
DIMENSIONS = list(dict.fromkeys(row["dimension"] for row in CODEBOOK))
CODES = [f"{dimension}_L{level}" for dimension in DIMENSIONS for level in (1, 2, 3)]


def save_csv(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)


def load_levels(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(["session_id", "order", "group", *DIMENSIONS]) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"原始資料缺少欄位：{', '.join(sorted(missing))}")
        if "episode_id" in reader.fieldnames:
            raise ValueError("此版本使用聊天內唯一 order；請先確認事件邊界並移除 episode_id。")
        rows = list(reader)
    if not rows:
        raise ValueError(f"輸入資料為空：{path}")
    for line, row in enumerate(rows, 2):
        for column in ["order", *DIMENSIONS]:
            try:
                row[column] = int(row[column])
            except (ValueError, TypeError) as exc:
                raise ValueError(f"第 {line} 列 {column} 必須為整數，缺失值不可填成 0。") from exc
    return rows


def encode_levels(rows):
    result = []
    seen = set()
    session_groups = {}
    for row in rows:
        if not row["session_id"] or row["group"] not in GROUPS:
            raise ValueError("session_id 不可空白，group 必須為 A 或 B。")
        key = (row["session_id"], row["order"])
        if key in seen:
            raise ValueError("同一聊天內的 order 不可重複。")
        seen.add(key)
        previous = session_groups.setdefault(row["session_id"], row["group"])
        if previous != row["group"]:
            raise ValueError("同一次聊天不可跨群。")
        record = {key: row[key] for key in ("session_id", "order", "group")}
        for dimension in DIMENSIONS:
            value = row[dimension]
            if type(value) is not int or value not in (0, 1, 2, 3):
                raise ValueError(f"{dimension} 必須是 0–3 整數，收到 {value!r}")
            for level in (1, 2, 3):
                record[f"{dimension}_L{level}"] = int(value == level)
        result.append(record)
    return sorted(result, key=lambda row: (row["session_id"], row["order"]))


def main():
    argparse.ArgumentParser(description=__doc__, add_help=False).parse_args()
    source = DATA / "original_levels.csv"
    if not source.exists():
        raise FileNotFoundError(f"找不到原始資料，請先準備：{source}")
    rows = load_levels(source)
    binary = encode_levels(rows)
    destination = DATA / "binary_input.csv"
    save_csv(destination, binary)
    print(f"完成前處理：{len(binary)} 段、{len(DIMENSIONS)} 構面、{len(CODES)} 個二元代碼。")
    print(destination)


if __name__ == "__main__":
    main()
