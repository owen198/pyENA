# Gender ENA 獨立範例

在 gender_ena 目錄執行 `python3 case1.py` 或 `python3 case2.py`。兩支程式均可獨立運作，不需要 common.py 或另一支案例程式；需要 pyena、numpy、matplotlib。

## 資料

- case1/original_levels.csv：200 筆逐段 0–3 模擬評分，為案例一主要輸入。
- case1/binary_input.csv：由原始評分轉成構面 × L1/L2/L3，每次執行重新轉換。0 表示不相關，不另設 L0 節點；缺失不可填 0。
- case2/binary_input.csv：200 筆逐段主題 0／1 模擬編碼，為案例二主要輸入。
- 各案例的 codebook.csv：代碼對照，非 200 筆輸入資料。

每個案例含 20 次聊天，每次 10 段；group A/B 各 10 次聊天、100 段。同一聊天不可跨群。group 是 metadata，不是網絡節點。

預設讀取既有 CSV，不改寫既有分群。若輸入不存在，會建立模擬資料。欲重新產生資料及分群：

```bash
python3 case1.py --regenerate-data --group-seed 42
python3 case2.py --regenerate-data --group-seed 42
```

預設種子 20260922。只指定 --group-seed 不會重新分配既有 CSV。讀入既有 CSV 時，摘要中的種子為 null，避免推測資料來源。

## 分析

以聊天片段為編碼單位，每個 session_id 為一張網絡，conversation=[session_id, episode_id]。window_size_back=1 僅計算段內共現；兩群比較採 rotation="mean"。參照專案 example.py 呼叫 generate_analysis_outputs，輸出至 ../outputs/case1 和 ../outputs/case2。

使用 `--summary-only` 可略過繪圖，仍更新座標、共現計數與統計摘要。此模式不更新既有圖片；資料變更後請完整執行。

本資料為模擬編碼，沒有自動判讀文字。隨機群組的 p 值僅供流程展示，不能解釋為實質教育差異；群組統計樣本數為每群 10 次聊天，不是 100 段。同一構面的不同等級在段內互斥是編碼規則，不代表心理上的互斥。若原始資料缺乏共現或足夠結構變異，應檢查資料與研究設計，不可為了產生圖表而捏造連線。
