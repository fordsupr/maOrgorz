---
name: orgorz-seed-villages
description: >-
  Dev-only 本機種子工具：批量建里（§3.2.1.1）。把一份里清單（CSV 文字檔或內建範例）一次灌進
  本機 local D1，皆設為「系統代管」（owner=系統 bot、status='system_managed'，待真人里長認領），
  同名同行政區自動略過（冪等）。觸發語如「批量建里」「灌一批測試里」「種子台灣里清單」
  「建幾個里測歸屬 onboarding」。**僅限本機 dev 環境執行**（只動 local D1、斷言
  .wrangler/state/v3/d1、拒 remote）。適用全能里長 v2（Hono on CF Workers）專案。
---

# orgorz-seed-villages — 本機批量建里（dev-only）

把一批「里」一次灌進本機 D1，省去逐筆點擊 admin UI 或手刻 SQL。對應 [hono_api新規格.md](hono_api新規格.md) §3.2.1.1 批量建里 + [14虛擬里長.md](14虛擬里長.md)。建立的里皆 `type='village'`、`owner_id='profile_system_bot'`、`status='system_managed'`（admin 自動代理，真人里長後走 `PATCH /villages/:id/claim`）。

## 何時用
- 本機要測「註冊強制歸屬里」onboarding 閘門 / 里搜尋 / 申請流程，但 D1 沒有里可加入。
- 任何「灌一批里 / 種子台灣里清單 / 批量建里測試」請求。

## 怎麼用
腳本在 [seed.mjs](seed.mjs)，**cwd 必須是專案根**（含 `wrangler.toml`）。

```bash
# 內建範例（桃園市中壢區數個里）
node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --sample

# 從 CSV 檔（每行「里名,縣市,鄉鎮市區」，縣市/區可省）
node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --file villages.csv

# 列出本機現有里
node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --list
```

CSV 格式（每行一里，逗號分隔，縣市/區可省）：

```
中山里,桃園市,中壢區
光明里,桃園市,中壢區
自強里
```

**冪等**：同 `(里名, 縣市, 鄉鎮市區)` 已存在自動略過。執行後印出新增/略過計數。提醒使用者**重整前端**才生效。

## dev-only 三道防線
① 只走 `wrangler d1 execute --local`，無 remote 路徑；② 啟動斷言 `.wrangler/state/v3/d1` 存在，否則拒跑；③ 拒絕任何 `--remote` / `--env` 參數。**絕不可改去打 remote**；remote 種子另循 admin 端點 / 人工 `--remote`。
