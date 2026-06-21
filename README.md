# maOrgorz — 全能里長 v2 專案 dev skills

全能里長 v2（Omni-LiZhang，Hono on Cloudflare Workers）專案專屬的 **dev-only skills** 收斂庫。
每個 skill 皆內建 dev-only 三道防線（只打 local / 斷言 `.wrangler/state/v3/d1` / 拒 remote），**絕不可改去打 production**。

結構：每個 skill = `<skill>/SKILL.md` + `<skill>/scripts/*.mjs`。

| Skill | 用途 | 入口 |
|---|---|---|
| [orgorz-addchief](orgorz-addchief/) | 本機治理種子：把某 email 的 profile 加進「里 / 跨里組織 / 社區」並授 owner/staff/resident（里長/里民/組織主/管委/信眾/住戶），測「多里切換 / 組織專區 / 社區治理」畫面用。 | `node orgorz-addchief/scripts/seed.mjs --email <e> --type village\|organization\|community --name <名> --role owner\|staff\|resident` |
| [orgorz-pipeline-offering](orgorz-pipeline-offering/) | 本機端到端跑「批量上架非同步排程」pipeline（提交→處理→建草稿→通知→歸檔），亦可 `--list` / `--backfill`（補跑 pending）。對應 hono §3.7.3 / V2 §5.1.2。 | `node orgorz-pipeline-offering/scripts/seed.mjs --email <e> --sample --run` |
| [orgorz-seed-villages](orgorz-seed-villages/) | 本機批量建里：把一份里清單（`--file villages.csv` 或 `--sample`）一次灌進 local D1，皆 `system_managed` + bot owner（待真人里長認領），同名同行政區自動略過（冪等）；亦可 `--list`。供測「註冊強制歸屬里」onboarding/搜尋/申請。對應 §3.2.1.1 / §3.2.1.4。 | `node orgorz-seed-villages/scripts/seed.mjs --sample` |

> 安裝：clone 後可 symlink / 複製各 skill 目錄至專案 `.claude/skills/` 或 user-level `~/.claude/skills/`。
> 前置：`npm run dev`（dev server 起、`EXPOSE_OTP_FOR_DEBUG=true`）；cwd = orgOrz 專案根。
