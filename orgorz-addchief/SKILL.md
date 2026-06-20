---
name: orgorz-addchief
description: >-
  Dev-only 本機種子工具：把某 profile（依 email）加進「里 / 跨里組織 / 社區」並授予 owner/staff/resident
  角色——里長、里民、組織主、管委、信眾、社區管委、住戶。觸發語如「把 X 加到龍岡里」「種子一個里長/里民」
  「建測試組織 @天元宮 並加我為管委」「把某人設為某社區住戶」「造治理測試資料」。**僅限本機 dev 環境執行**
  （只動 local D1、斷言 .wrangler/state/v3/d1 存在、不碰 production）。適用全能里長 v2（Hono on CF Workers）專案。
---

# orgorz-addchief — 本機治理種子（dev-only）

把使用者快速加進治理結構，省去手刻 `wrangler d1 execute` SQL。對應 [全能里長架構規格書 V2.md](全能里長架構規格書%20V2.md) 的三條治理軸：

| `--type` | 主體 | `--role` 可填 | 落地 |
|---|---|---|---|
| `village` | 里（§3.2.1） | `owner`(里長/別名 `chief`) / `staff`(助理) / `resident`(里民) | `services_and_assets(type='village')` + 視角色 set owner 或加 participation |
| `organization` | 跨里組織（§3.2.3 B-2） | `owner`(組織主) / `staff`(管委) / `resident`(信眾/別名 `member`) | 建 `@org` tag + 共用 id 的治理 asset + participation |
| `community` | 社區/物業（§3.2.3 A） | `owner`(管委負責人/別名 `manager`) / `staff`(物業) / `resident`(住戶) | `services_and_assets(type='community')`（需 `--village` 母里）+ participation |

## 何時用
- 使用者要在本機測試「多里切換」「組織專區」「社區管委」等需要既有治理資料的畫面，但手上沒有對應角色。
- 任何「把我/某 email 加成某里的里長或里民 / 某組織的管委或信眾 / 某社區的住戶」請求。

## 怎麼用
腳本在 [seed.mjs](seed.mjs)，**cwd 必須是專案根**（含 `wrangler.toml`）。先確認該 email 已登入過一次（`profiles` 有檔）。

```bash
# 里長（owner）；里不存在會自動建
node .claude/skills/orgorz-addchief/scripts/seed.mjs --email fordsupr@gmail.com --type village --name 龍岡里 --role owner
# 里民
node .claude/skills/orgorz-addchief/scripts/seed.mjs --email a@x.com --type village --name 龍岡里 --role resident
# 組織主 / 信眾（自動建 @tag + 治理 asset）
node .claude/skills/orgorz-addchief/scripts/seed.mjs --email me@x.com --type organization --name @天元宮 --role owner
node .claude/skills/orgorz-addchief/scripts/seed.mjs --email f@x.com --type organization --name @天元宮 --role resident
# 社區管委 staff（需母里）
node .claude/skills/orgorz-addchief/scripts/seed.mjs --email m@x.com --type community --name 第一社區 --village 龍岡里 --role staff
```

旗標：`--no-create`（目標不存在時不自動建、改報錯）。皆**冪等**（重跑安全）。執行後請提醒使用者**重整前端**才生效。

## 同名去重守門（執行前自動檢查）

- 解析里／組織／社區時，若 DB 已有 **大於 1 筆同名** 標的 → 名稱重複、無法安全判定要綁哪一筆 → **拒絕執行（exit 4）** 並列出候選 id；請先清理重複資料或以 `wrangler d1 execute` 指定 asset id。
- 為已是 owner 的 profile 再加 `staff` / `resident` 子角色：§3.5 合法，但會在前端列出**重複入口**（本工具曾踩雷來源）→ 印出 `⚠` 提醒，不中止。

## dev-only（硬性，三道防線——絕不可繞過）
1. 腳本**只走 `wrangler d1 execute --local`**，原始碼無任何 remote 路徑。
2. 啟動即斷言本機 `.wrangler/state/v3/d1` 存在，否則拒跑（CI/prod 無此目錄）。
3. 明確拒絕 `--remote` / `--env remote` / `--force-remote`。

→ **絕不可**為了「同步到 production」而改本 skill 去打 `--remote`。要動 remote 種子，另循 admin 流程（[scripts/admin/](scripts/admin/)）或人工 `wrangler d1 execute --remote`，不走此 skill。

## 注意
- email 須先登入建檔（本工具不建 profile，避免繞過 OTP）。
- 角色真理仍由 `service_participations` / asset owner 動態決定（§3.5）——本工具只寫這些既有表，不寫 JWT/profiles，與正式流程同構。
- 軟刪/全形等不變式不涉及（純治理 seed）。
