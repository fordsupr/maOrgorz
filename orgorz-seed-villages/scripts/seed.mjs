#!/usr/bin/env node
// orgorz-seed-villages — Dev-only 批量建里（§3.2.1.1）。
// 把一批里灌進本機 local D1，皆 owner=系統 bot、status='system_managed'（待真人里長認領）。
//
// dev-only 三道防線：
//   ① 只走 `wrangler d1 execute --local`，**無 remote 路徑**；
//   ② 啟動斷言 `.wrangler/state/v3/d1` 存在，否則拒跑；
//   ③ 拒絕任何 --remote / --env 參數。
//
// 用法（cwd = 專案根）：
//   node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --sample
//   node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --file villages.csv
//   node .claude/skills/orgorz-seed-villages/scripts/seed.mjs --list
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const SYSTEM_BOT = 'profile_system_bot'

// ── dev-only 守門 ② ──
if (!existsSync('.wrangler/state/v3/d1')) {
  console.error('✗ 找不到 .wrangler/state/v3/d1 —— orgorz-seed-villages 僅限本機 dev（先 npm run db:migrate:local）。拒絕執行。')
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
const args = parseArgs(process.argv.slice(2))
// ── dev-only 守門 ③ ──
if (args.remote === 'true' || args.env === 'remote' || args['force-remote'] === 'true') {
  console.error('✗ orgorz-seed-villages 為 dev-only，不接受 remote 參數。拒絕執行。')
  process.exit(1)
}

const q = (s) => String(s).replace(/'/g, "''")
function exec(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0]?.results ?? []
}

if (args.list === 'true') {
  const rows = exec("SELECT title, region_county, region_district, status FROM services_and_assets WHERE type='village' ORDER BY created_at DESC LIMIT 100")
  console.log(`▶ [local] 現有里 ${rows.length} 筆（最多 100）：`)
  for (const r of rows) console.log(`  · ${r.title}${r.region_county ? ` (${r.region_county}${r.region_district || ''})` : ''} [${r.status}]`)
  process.exit(0)
}

const SAMPLE = [
  ['中山里', '桃園市', '中壢區'],
  ['光明里', '桃園市', '中壢區'],
  ['自強里', '桃園市', '中壢區'],
  ['龍岡里', '桃園市', '中壢區'],
  ['興仁里', '桃園市', '平鎮區'],
]

let items
if (args.sample === 'true') {
  items = SAMPLE
} else if (args.file && args.file !== 'true') {
  items = readFileSync(args.file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((s) => s.trim()))
    .filter((cols) => cols[0])
} else {
  console.error('用法: --sample | --file <csv> | --list')
  process.exit(1)
}

console.log(`▶ [local] 批量建里 ${items.length} 筆（system_managed + bot owner）`)
let created = 0
let skipped = 0
for (const [title, county, district] of items) {
  const c = county || null
  const d = district || null
  const dupSql = `SELECT id FROM services_and_assets WHERE type='village' AND title='${q(title)}' AND region_county IS ${c ? `'${q(c)}'` : 'NULL'} AND region_district IS ${d ? `'${q(d)}'` : 'NULL'} LIMIT 1`
  if (exec(dupSql)[0]) {
    skipped++
    console.log(`  ⏭  略過（已存在）：${title}${c ? ` (${c}${d || ''})` : ''}`)
    continue
  }
  const id = randomUUID()
  exec(
    `INSERT INTO services_and_assets (id, type, title, owner_id, status, region_county, region_district) VALUES ('${id}', 'village', '${q(title)}', '${SYSTEM_BOT}', 'system_managed', ${c ? `'${q(c)}'` : 'NULL'}, ${d ? `'${q(d)}'` : 'NULL'})`,
  )
  created++
  console.log(`  ✅ 建立：${title}${c ? ` (${c}${d || ''})` : ''}`)
}
console.log(`\n完成：新增 ${created}、略過 ${skipped}（共 ${items.length}）。請重整前端。`)
