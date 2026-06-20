---
name: orgorz-pipeline-offering
description: >-
  Dev-only 本機驅動：跑「批量上架非同步排程」pipeline（hono §3.7.3 / V2 §5.1.2）——把一份服務清單／菜單文本
  提交成背景任務（原文存 R2、建 bulk_upload_jobs）、立即觸發處理（解析→建草稿→寄信通知→R2 歸檔）、
  並印出建立的草稿。也可列任務狀態或對 pending 任務補跑。觸發語如「測一下批量上架排程」「跑批量上架 pipeline」
  「補跑卡住的批量任務」「列出我的批量上架任務」。**僅限本機 dev 環境執行**（只打 localhost、斷言 local D1、拒 remote）。
  適用全能里長 v2（Hono on CF Workers）專案。
---

# orgorz-pipeline-offering — 批量上架非同步排程 pipeline（dev-only）

把 §3.7.3 的產品級 async pipeline 在本機**端到端跑一遍**，省去手刻 curl + OTP 登入。對應規格：

- 落地形態 [hono_api新規格.md](hono_api新規格.md) §3.7.3、業務語義 [全能里長架構規格書 V2.md](全能里長架構規格書%20V2.md) §5.1.2。
- 產品 pipeline 本體在 app 後端（[src/services/bulk-ingest.ts](src/services/bulk-ingest.ts) + [src/routes/assets.ts](src/routes/assets.ts) `bulk-jobs` 群組 + cron）；**本 skill 只是維運/測試的薄驅動**。

## pipeline 四段（本 skill 觸發的就是這條）

1. **提交** `POST /assets/bulk-jobs`：原文寫 R2 `bulk-jobs/pending/<id>.md` + 建 `bulk_upload_jobs(pending)`，**請求內不解析**。
2. **處理**（cron 或 `/run`）：權限再驗 → `parseOfferingText` → **建草稿（不自動 activate，守 §3.7.2 校對不變式）**。
3. **通知**：cloud-mail 寄信給 owner（成功/失敗；dev 未設帳密則略過寄信、不阻塞）。
4. **歸檔**：R2 `pending/` → `bak/`（copy+delete）+ DB `status='done'/'failed'` + 計數。

## 何時用
- 要在本機驗證批量上架排程是否正常（提交→處理→草稿→歸檔）。
- 已有一份服務清單／菜單文本，想快速灌成一批草稿來測「我的服務」校對畫面。
- 有 pending 任務卡住（cron 沒跑到），想手動補跑。

## 怎麼用
前置：`npm run dev`（dev server 起；AI/Vectorize 走 remote）。登入走 OTP `debug_code`（需 `EXPOSE_OTP_FOR_DEBUG=true`）。**cwd = 專案根**。

```bash
# 範例文本 → 提交 → 立即處理 → 印出草稿
node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --sample --run

# 自訂文本 / 檔案；menu 型指定 @店名
node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --text "馬桶漏水 NT$ 800 - 2,500" --run
node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --file menu.md --shop-type menu --shop-tag @早餐店 --run

# 列我的任務狀態
node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --list

# 補跑所有 pending（模擬 cron backstop）
node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --backfill
```

旗標：`--sample`（內建水電範例）/ `--text`/`--file`（內容三擇一）、`--run`（立即處理，否則留給 cron）、`--shop-type service_list|menu`、`--shop-tag @店名`（menu 型綁定）、`--category <code>`、`--list`、`--backfill`。

## dev-only 三道防線（同 [addChiefOrg](.claude/skills/addChiefOrg/) 慣例）
1. **只打本機**：`BASE` 必為 `localhost`/`127.0.0.1`，任何非本機 URL 一律拒跑。
2. **斷言 local D1**：啟動檢查 `.wrangler/state/v3/d1` 存在（CI/prod 無此目錄）。
3. **拒 remote**：`--remote`/`--env remote` 一律拒絕。

> **絕不可改去打 remote**；production 要跑批量上架走真實前端流程或 admin 工具。

## 對照驗證
端到端 smoke：[scripts/smoke/bulk-async.sh](scripts/smoke/bulk-async.sh)（17/17：提交→授權→/run→草稿不變式→R2 歸檔→重入/越權）。
