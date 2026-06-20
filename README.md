# maOrgorz — 全能里長 v2 專案 dev skills

全能里長 v2（Omni-LiZhang，Hono on Cloudflare Workers）專案專屬的 **dev-only skills** 收斂庫。
每個 skill 皆內建 dev-only 三道防線（只打 local / 斷言 `.wrangler/state/v3/d1` / 拒 remote），**絕不可改去打 production**。

| Skill | 用途 | 入口 |
|---|---|---|
| [orgorz-pipeline-offering](orgorz-pipeline-offering/) | 本機端到端跑「批量上架非同步排程」pipeline（提交→處理→建草稿→通知→歸檔），亦可 `--list` / `--backfill`（補跑 pending）。對應 hono §3.7.3 / V2 §5.1.2。 | `node orgorz-pipeline-offering/seed.mjs --email <e> --sample --run` |

> 安裝：clone 後可 symlink / 複製各 skill 目錄至專案 `.claude/skills/` 或 user-level `~/.claude/skills/`。
> 前置：`npm run dev`（dev server 起、`EXPOSE_OTP_FOR_DEBUG=true`）；cwd = orgOrz 專案根。
