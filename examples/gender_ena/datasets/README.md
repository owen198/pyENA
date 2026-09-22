# 性別 ENA 案例資料

完整編碼表、資料格式、操作與參數說明請見 [案例 README](../README.md)。

- `case1/codebook.docx`：十構面 0–3 原始評分規準；`codebook.csv` 為含 L0 的 40 筆機器可讀定義。
- `case1/original_levels.csv`：200 段原始等級。執行 `case1_preprocess.py` 後，產生 `case1/binary_input.csv` 的 30 個二元代碼；再執行 `case1.py` 分析。
- `case2/codebook.xlsx`：十五個主題的原始編碼表；`codebook.csv` 保存代碼、中文名稱、分類、定義及 Excel 列號。
- `case2/binary_input.csv`：200 段、十五個主題的二元編碼，由 `case2.py` 讀取。

共用識別欄位為 `session_id`、`order`、`group`；已移除原本一律為 E1 的 `episode_id`。所有分析輸入仍為模擬資料，新增欄位不是依原始文字重新編碼；其生成方式與保留欄位詳見案例 README。

Word 與 Excel 原始檔不會被程式改寫。更新編碼規準時請同步維護 CSV 對照表與資料欄位。
