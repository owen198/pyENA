# pyENA 範例索引

每個案例各自保存程式、`datasets/` 與 `outputs/`。以下指令從專案根目錄執行，並假設目前的 Python 環境已安裝 pyENA（`python3 -m pip install -e .`）。

| 案例 | 說明 | 程式 | 資料與輸出（相對案例目錄） |
| --- | --- | --- | --- |
| [rs](rs/) | Handbook ENA，比較 FirstGame 與 SecondGame | [example.py](rs/example.py)、[example_3d.py](rs/example_3d.py) | `datasets/RS.data.csv`；二維 `outputs/`、三維 `outputs_3d/` |
| [leet_dse](leet_dse/) | Leet 反思資料，比較 HDSE 與 LDSE | [example_leet.py](leet_dse/example_leet.py) | `datasets/leet.csv`（需自行提供）；`outputs/` |
| [gender_ena](gender_ena/datasets/README.md) | 性別教育合成資料：程度編碼與主題編碼 | [case1.py](gender_ena/case1.py)、[case2.py](gender_ena/case2.py) | `datasets/case1/`、`datasets/case2/`；`outputs/case1/`、`outputs/case2/` |

## 執行方式

```bash
python3 examples/rs/example.py
python3 examples/rs/example.py --summary-only
python3 examples/rs/example_3d.py
python3 examples/leet_dse/example_leet.py
python3 examples/gender_ena/case1.py
python3 examples/gender_ena/case2.py
```

也可進入案例目錄後直接執行程式，例如在 `examples/rs/` 執行 `python3 example.py`。資料與輸出位置依程式所在目錄定位，不受執行時工作目錄影響。重複執行會更新對應輸出檔案。

Leet 資料未隨專案提供，請先將 CSV 放入 `examples/leet_dse/datasets/leet.csv`。

## 新增案例

建立 `examples/<case_name>/`，將程式、`datasets/`、`outputs/` 與案例說明放在同一資料夾，並在上表新增索引。
