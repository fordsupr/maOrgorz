#!/usr/bin/env node
// orgorz-addchief — Dev-only 種子工具：把 profile 加進「里 / 組織 / 社區」並授角色。
//
// 治理三軸（對應 V2 §3.2.1/§3.2.3 B-2/§3.2.3 A）：
//   --type village       里        role: owner(里長/chief) | staff(助理) | resident(里民)
//   --type organization  跨里組織  role: owner(組織主)     | staff(管委)  | resident(信眾/member)
//   --type community     社區/物業 role: owner(管委負責人) | staff(物業)  | resident(住戶)   （需 --village 母里）
//
// dev-only 三道防線：
//   ① 只走 `wrangler d1 execute --local`，**無 remote 路徑**（程式碼層不可能碰 prod）；
//   ② 啟動斷言本機 local D1 目錄 `.wrangler/state/v3/d1` 存在，否則拒跑（CI/prod 無此目錄）；
//   ③ 不接受任何 --remote / --env 參數。
//
// 用法（cwd = 專案根）：
//   node .claude/skills/orgorz-addchief/scripts/seed.mjs --email me@x.com --type village --name 龍岡里 --role owner
//   node .claude/skills/orgorz-addchief/scripts/seed.mjs --email me@x.com --type organization --name @天元宮 --role owner
//   node .claude/skills/orgorz-addchief/scripts/seed.mjs --email a@x.com --type organization --name @天元宮 --role resident   # 信眾
//   node .claude/skills/orgorz-addchief/scripts/seed.mjs --email m@x.com --type community --name 第一社區 --village 龍岡里 --role staff
//
// 前置：該 email 須**已登入過一次**（profiles 有檔）。目標里/組織/社區不存在時預設自動建立（--no-create 關閉）。
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

// ── dev-only 守門 ② ──
if (!existsSync('.wrangler/state/v3/d1')) {
  console.error('✗ 找不到 .wrangler/state/v3/d1 —— orgorz-addchief 僅限本機 dev（先 npm run dev / npm run db:migrate:local）。拒絕執行。')
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
  console.error('用法: node .claude/skills/orgorz-addchief/scripts/seed.mjs --email <email> --type <village|organization|community> --name <名> [--role owner|staff|resident] [--village <母里:community 必填>] [--no-create]')
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
// ── dev-only 守門 ③：明確拒絕 remote ──
if (args.remote === 'true' || args.env === 'remote' || args['force-remote'] === 'true') usage('orgorz-addchief 為 dev-only，不接受 remote 參數')

const email = args.email
const type = (args.type || '').toLowerCase()
const name = args.name
const parentVillage = args.village // community 母里
const allowCreate = args.create !== 'false' && args['no-create'] !== 'true'

// role 別名 → 正規化（chief/manager→owner，member→resident）
const ALIAS = { chief: 'owner', manager: 'owner', member: 'resident', owner: 'owner', staff: 'staff', resident: 'resident' }
const role = ALIAS[(args.role || 'owner').toLowerCase()]

if (!email) usage('缺 --email')
if (!['village', 'organization', 'community'].includes(type)) usage('--type 須為 village|organization|community')
if (!name) usage('缺 --name')
if (!role) usage('--role 須為 owner|staff|resident（別名 chief/manager/member）')
if (type === 'community' && !parentVillage) usage('--type community 需 --village <母里名>')

const q = (s) => String(s).replace(/'/g, "''")
function exec(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0]?.results ?? []
}
const one = (sql) => exec(sql)[0]

// 同名去重守門：回傳唯一一筆；>1 筆同名 → 名稱重複無法安全判定，拒絕執行（避免盲綁 LIMIT 1 綁錯標的）。
function findUnique(sql, label) {
  const rows = exec(sql)
  if (rows.length > 1) {
    console.error(`✗ 偵測到 ${rows.length} 筆同名${label}：${rows.map((r) => r.id).join(', ')}`)
    console.error('  名稱重複 → 無法安全判定要綁哪一筆。請先清理重複資料（或直接以 wrangler d1 execute 指定 asset id 綁定）。拒絕執行。')
    process.exit(4)
  }
  return rows[0]
}

console.log(`▶ [local] type=${type} role=${role} email=${email} name=${name}${parentVillage ? ` village=${parentVillage}` : ''}`)

// 1) profile（須已建檔）
const prof = one(`SELECT id FROM profiles WHERE contact_info='${q(email)}' LIMIT 1`)
if (!prof) {
  console.error(`✗ 找不到 profile（${email}）——請先用該 email 登入過一次再執行`)
  process.exit(2)
}
const pid = prof.id
console.log(`  profile = ${pid}`)

// 母里（community 用）：解析或建立
function ensureVillage(title, ownerIfCreate) {
  const v = findUnique(`SELECT id FROM services_and_assets WHERE type='village' AND title='${q(title)}'`, `里「${title}」`)
  if (v) return v.id
  if (!allowCreate) { console.error(`✗ 里「${title}」不存在且 --no-create`); process.exit(3) }
  const id = randomUUID()
  const owner = ownerIfCreate ? `'${ownerIfCreate}'` : 'NULL'
  const status = ownerIfCreate ? 'active' : 'system_managed'
  exec(`INSERT INTO services_and_assets (id, type, title, owner_id, status) VALUES ('${id}','village','${q(title)}',${owner},'${status}')`)
  console.log(`  ＋ 建立里 ${id}（status=${status}）`)
  return id
}

// 2) 解析/建立目標 asset → assetId
let assetId
if (type === 'village') {
  assetId = ensureVillage(name, role === 'owner' ? pid : null)
} else if (type === 'organization') {
  const tagName = name.startsWith('@') ? name : `@${name}`
  let tag = findUnique(`SELECT id, owner_id FROM tags WHERE type='organization' AND name='${q(tagName)}' AND deleted_at IS NULL`, `組織「${tagName}」`)
  if (!tag) {
    if (!allowCreate) { console.error(`✗ 組織「${tagName}」不存在且 --no-create`); process.exit(3) }
    const tid = randomUUID()
    exec(`INSERT INTO tags (id, type, name, owner_id) VALUES ('${tid}','organization','${q(tagName)}','${pid}')`)
    tag = { id: tid, owner_id: pid }
    console.log(`  ＋ 建立 @organization tag ${tid}`)
  }
  // 治理容器 asset 與 tag 共用 id（§3.2.3 B-2）
  exec(`INSERT OR IGNORE INTO services_and_assets (id, type, owner_id, title, status, village_id) VALUES ('${tag.id}','organization','${tag.owner_id ?? pid}','${q(tagName)}','active',NULL)`)
  assetId = tag.id
} else {
  // community：母里 → 社區 asset
  const vid = ensureVillage(parentVillage, null)
  let comm = findUnique(`SELECT id FROM services_and_assets WHERE type='community' AND title='${q(name)}' AND village_id='${vid}'`, `社區「${name}」`)
  if (!comm) {
    if (!allowCreate) { console.error(`✗ 社區「${name}」不存在且 --no-create`); process.exit(3) }
    const cid = randomUUID()
    const owner = role === 'owner' ? `'${pid}'` : 'NULL'
    exec(`INSERT INTO services_and_assets (id, type, title, owner_id, status, village_id) VALUES ('${cid}','community','${q(name)}',${owner},'active','${vid}')`)
    console.log(`  ＋ 建立社區 ${cid}（母里 ${vid}）`)
    comm = { id: cid }
  }
  assetId = comm.id
}
console.log(`  asset = ${assetId}`)

// 3) 授角色（皆冪等；participations UNIQUE(asset_id,profile_id,role) → INSERT OR IGNORE）
if (role === 'owner') {
  exec(`UPDATE services_and_assets SET owner_id='${pid}', status='active' WHERE id='${assetId}'`)
  console.log('  ✓ 設為 owner（里長／組織主／管委負責人）')
} else {
  // 已是 owner 又加 sub-role → 雖 §3.5 合法，但會在前端產生「同名重複 pill」的困惑（本次踩雷來源）→ 提醒。
  const owns = one(`SELECT 1 AS x FROM services_and_assets WHERE id='${assetId}' AND owner_id='${pid}'`)
  if (owns) console.warn(`  ⚠ 此 profile 已是該 asset 的 owner，再加 ${role} 會在前端列出重複入口（§3.5 合法但易混淆）；如非必要可略過。`)
  exec(`INSERT OR IGNORE INTO service_participations (id, asset_id, profile_id, role) VALUES ('${randomUUID()}','${assetId}','${pid}','${role}')`)
  console.log(`  ✓ 加入 ${role}（${role === 'staff' ? '助理／管委／物業' : '里民／信眾／住戶'}）`)
}

console.log('✔ 完成（重整前端後生效）')
