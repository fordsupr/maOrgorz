#!/usr/bin/env node
// orgorz-pipeline-offering — Dev-only 驅動：在本機跑「批量上架非同步排程」pipeline（hono §3.7.3 / V2 §5.1.2）。
//
// 用途（包裝測試/維運/補跑，§3.7.3）：
//   ① 測試：提交一筆批量上架任務（貼文或範例）→ 立即 /run → 印出建立的草稿。
//   ② 維運/補跑：對自己所有 pending 任務逐筆 /run（模擬 cron 補跑卡住的任務）。
//   ③ 觀察：列出自己的批量任務狀態。
//
// dev-only 三道防線：
//   ① BASE 必為本機（localhost / 127.0.0.1），任何非本機 URL 一律拒跑；
//   ② 啟動斷言 local D1 目錄 `.wrangler/state/v3/d1` 存在（CI/prod 無此目錄）；
//   ③ 明確拒絕 --remote / --env remote 參數。
//
// 前置：`npm run dev`（dev server 起、AI/Vectorize remote）。登入走 OTP debug_code（EXPOSE_OTP_FOR_DEBUG=true）。
//
// 用法（cwd = 專案根）：
//   node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --sample --run      # 範例→提交→立即處理
//   node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --file menu.md --run --shop-type menu --shop-tag @早餐店
//   node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --text "馬桶漏水 NT$ 800 - 2,500" --run
//   node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --list                # 列我的任務
//   node .claude/skills/orgorz-pipeline-offering/seed.mjs --email me@x.com --backfill            # 對所有 pending 補跑
import { existsSync, readFileSync } from 'node:fs'

// ── dev-only 守門 ② ──
if (!existsSync('.wrangler/state/v3/d1')) {
  console.error('✗ 找不到 .wrangler/state/v3/d1 —— orgorz-pipeline-offering 僅限本機 dev（先 npm run dev / npm run db:migrate:local）。拒絕執行。')
  process.exit(1)
}

function parseArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    a[key] = next && !next.startsWith('--') ? argv[++i] : 'true'
  }
  return a
}
function usage(msg) {
  if (msg) console.error('✗', msg)
  console.error('用法: node .claude/skills/orgorz-pipeline-offering/seed.mjs --email <email> [--sample | --text "..." | --file <path>] [--run] [--list] [--backfill] [--shop-type service_list|menu] [--shop-tag @店名] [--category <code>]')
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
// ── dev-only 守門 ③ ──
if (args.remote === 'true' || args.env === 'remote' || args['force-remote'] === 'true') usage('orgorz-pipeline-offering 為 dev-only，不接受 remote 參數')

const BASE = (args.base || 'http://localhost:8787').replace(/\/$/, '')
// ── dev-only 守門 ① ──
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`✗ BASE 非本機（${BASE}）—— orgorz-pipeline-offering 僅限本機 dev。拒絕執行。`)
  process.exit(1)
}
const API = `${BASE}/api/v1`

const email = args.email
if (!email) usage('缺 --email')

const SAMPLE = `分類,項目名稱,內容,報價
住戶室內維修,馬桶漏水與零件更換,更換落水器進水閥,NT$ 800 - 2,500
住戶室內維修,通水管,廚房/浴室阻塞疏通,NT$ 1,500 - 3,500
社區公共設施,揚水馬達檢修,送水馬達汰換,現場勘查後報價
`

// ── OTP 登入（debug_code）取 cookie ──
async function login() {
  const rc = await fetch(`${API}/auth/request-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const rcj = await rc.json().catch(() => ({}))
  const code = rcj?.data?.debug_code
  if (!code) { console.error('✗ 取不到 debug_code（需 EXPOSE_OTP_FOR_DEBUG=true 且 dev server 在跑）'); process.exit(1) }
  const vc = await fetch(`${API}/auth/verify-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) })
  const cookie = (vc.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) { console.error('✗ 登入失敗'); process.exit(1) }
  return cookie
}
const reqJson = async (cookie, path, init = {}) => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

function fmtJob(j) {
  const extra = j.status === 'done' ? `建立 ${j.created_count ?? 0}/${j.item_count ?? 0} 草稿` : j.status === 'failed' ? `失敗:${j.error}` : ''
  return `  [${j.status}] ${j.id}  ${extra}`
}

const main = async () => {
  const cookie = await login()

  if (args.list === 'true') {
    const { json } = await reqJson(cookie, '/assets/bulk-jobs')
    const items = json?.data?.items ?? []
    console.log(`我的批量任務（${items.length}）：`)
    for (const j of items) console.log(fmtJob(j))
    return
  }

  if (args.backfill === 'true') {
    const { json } = await reqJson(cookie, '/assets/bulk-jobs')
    const pending = (json?.data?.items ?? []).filter((j) => j.status === 'pending')
    console.log(`補跑 ${pending.length} 筆 pending…`)
    for (const j of pending) {
      const { json: out } = await reqJson(cookie, `/assets/bulk-jobs/${j.id}/run`, { method: 'POST' })
      console.log(fmtJob(out?.data ?? { id: j.id, status: '?' }))
    }
    return
  }

  // 提交：text 來源 = --text / --file / --sample
  const text = args.text && args.text !== 'true' ? args.text : args.file && args.file !== 'true' ? readFileSync(args.file, 'utf8') : args.sample === 'true' ? SAMPLE : null
  if (!text) usage('需指定上架內容：--sample / --text "..." / --file <path>')
  const body = { text }
  if (args['shop-type'] === 'service_list' || args['shop-type'] === 'menu') body.shop_type = args['shop-type']
  if (args['shop-tag'] && args['shop-tag'] !== 'true') body.shop_tag_name = args['shop-tag']
  if (args.category && args.category !== 'true') body.platform_category = args.category

  const sub = await reqJson(cookie, '/assets/bulk-jobs', { method: 'POST', body: JSON.stringify(body) })
  const jobId = sub.json?.data?.id
  if (!jobId) { console.error('✗ 提交失敗:', JSON.stringify(sub.json)); process.exit(1) }
  console.log(`✓ 已提交任務 ${jobId}（status=${sub.json.data.status}，原文已存 R2 bulk-jobs/pending/${jobId}.md）`)

  if (args.run === 'true') {
    const out = await reqJson(cookie, `/assets/bulk-jobs/${jobId}/run`, { method: 'POST' })
    const d = out.json?.data
    if (!d) { console.error('✗ 處理失敗:', JSON.stringify(out.json)); process.exit(1) }
    console.log(`✓ 處理完成 status=${d.status} 解析 ${d.item_count} 筆、建立 ${d.created_count} 筆草稿${d.error ? ` (error=${d.error})` : ''}`)
    // 列出剛建立的草稿
    const drafts = await reqJson(cookie, '/assets?mine=1&status=draft&page_size=100')
    const titles = (drafts.json?.data?.items ?? []).map((a) => a.title).slice(0, 20)
    console.log(`  我的草稿（${(drafts.json?.data?.items ?? []).length}）：${titles.join('、')}`)
    console.log('  → 請至前端「我的服務」校對後上架（草稿不會自動上架，守 §3.7.2 校對不變式）。')
  } else {
    console.log('  （未加 --run：將由 cron 背景處理，或加 --run 立即處理）')
  }
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
