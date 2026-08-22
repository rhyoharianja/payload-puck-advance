#!/usr/bin/env node
/**
 * payload-puck-advance init
 *
 * Menulis file sambungan ke proyek Payload yang sudah ada, lalu menambal
 * `payload.config.ts`.
 *
 * SENGAJA bukan `postinstall`. pnpm memblokir lifecycle script secara default
 * (`pnpm.onlyBuiltDependencies`), dan menulis ke `src/` orang lain di setiap
 * install — termasuk di CI — bisa menimpa editan tanpa bisa di-review. CLI
 * eksplisit bisa dijalankan sekali, dilihat dulu dengan `--dry-run`, dan
 * dibatalkan.
 *
 * Prinsip: tidak pernah menimpa tanpa `--force`, selalu bisa dijalankan ulang,
 * dan lebih memilih melaporkan langkah manual daripada menebak.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { detect, exists } from './lib/detect.mjs'
import { manualInstructions, patchConfig } from './lib/patch.mjs'
import { ENV_KEYS, STYLES_CONTENTS, templates } from './lib/templates.mjs'

const C = {
  bold: (s) => `[1m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
}

const HELP = `
${C.bold('payload-puck-advance init')} — pasang file sambungan ke proyek Payload

  ${C.dim('npx payload-puck-advance init --dry-run')}   lihat rencananya dulu
  ${C.dim('npx payload-puck-advance init')}

${C.bold('Opsi')}
  --dry-run              tampilkan yang AKAN dilakukan, tidak menulis apa pun
  --force                timpa file yang sudah ada (backup .bak dibuat)
  --app-dir <path>       mis. src/app            (default: dideteksi)
  --route-group <name>   mis. (frontend), atau "" untuk tanpa group
  --alias <prefix>       mis. @                  (default: dari tsconfig paths)
  --src <dir>            mis. src                (default: dideteksi)
  --pages-slug <slug>    default: pages, atau puck-pages bila sudah dipakai
  --config <path>        path payload.config.ts
  --no-config-patch      jangan sentuh payload.config.ts
  --no-styles            jangan buat/ubah stylesheet
  --no-env               jangan sentuh .env.example
  -h, --help
`

const parseArgs = (argv) => {
  const flags = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      if (a === '-h') {
        flags.help = true
      } else {
        flags._.push(a)
      }
      continue
    }
    const key = a.slice(2)
    if (key.startsWith('no-')) {
      flags[key.slice(3)] = false
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }
  return flags
}

const args = parseArgs(process.argv.slice(2))
const command = args._[0] ?? 'init'

if (args.help || command === 'help') {
  console.log(HELP)
  process.exit(0)
}

if (command !== 'init') {
  console.error(C.red(`Perintah tidak dikenal: ${command}`))
  console.log(HELP)
  process.exit(1)
}

const cwd = process.cwd()
const dry = args['dry-run'] === true
const force = args.force === true

// --- 1. deteksi ---
const overrides = {}
if (typeof args['app-dir'] === 'string') overrides.appDir = args['app-dir']
if (typeof args['route-group'] === 'string') overrides.routeGroup = args['route-group']
if (args['route-group'] === '') overrides.routeGroup = ''
if (typeof args.alias === 'string') overrides.alias = args.alias
if (typeof args.src === 'string') overrides.srcRoot = args.src
if (typeof args['pages-slug'] === 'string') overrides.pagesSlug = args['pages-slug']
if (typeof args.config === 'string') overrides.configPath = args.config

const info = detect(cwd, overrides)

if (info.error) {
  console.error(C.red(`✗ ${info.error}`))
  process.exit(1)
}

if (!info.appDir) {
  console.error(
    C.red('✗ Direktori App Router tidak ditemukan.') +
      '\n  Tunjuk manual dengan --app-dir, mis. --app-dir src/app',
  )
  process.exit(1)
}

const ctx = {
  alias: info.alias,
  appDir: info.appDir,
  configPath: info.configPath,
  hasLivePreview: info.hasLivePreview,
  pagesSlug: info.pagesSlug,
  routeGroup: info.routeGroup,
  srcRel: info.srcRoot === '.' ? '' : `${info.srcRoot}/`,
}

// Stylesheet: kalau route group sudah punya, jangan diganti — cukup impor.
const groupDir = path.join(cwd, ctx.appDir, ctx.routeGroup || '')
const existingCss = ['styles.css', 'globals.css'].find((f) => exists(path.join(groupDir, f)))
ctx.stylesFile = args.styles === false ? null : (existingCss ?? 'styles.css')

console.log('')
console.log(C.bold('Terdeteksi'))
const row = (k, v, warn) =>
  console.log(`  ${k.padEnd(20)} ${warn ? C.yellow(String(v)) : String(v)}`)
row('package manager', info.packageManager)
row('src', info.srcRoot)
row('app dir', info.appDir)
row('route group', ctx.routeGroup === '' ? C.dim('(tidak ada)') : ctx.routeGroup)
row('alias impor', ctx.alias ?? C.dim('(tidak ada — pakai path relatif)'))
row('payload.config', info.configPath ?? C.yellow('tidak ditemukan'), !info.configPath)
row('slug halaman', ctx.pagesSlug, info.pagesTaken)

if (info.groupCandidates.length > 1) {
  console.log(
    C.yellow(
      `  ! ada ${info.groupCandidates.length} route group (${info.groupCandidates.join(', ')}); dipilih ${ctx.routeGroup}. Timpa dengan --route-group.`,
    ),
  )
}
if (!ctx.alias) {
  // Payload me-resolve path komponen relatif terhadap `admin.importMap.baseDir`,
  // dan nilainya tidak bisa ditebak dari luar. Tanpa alias, path yang ditulis bisa
  // benar atau salah tergantung setelan itu — jadi dilaporkan, bukan diasumsikan.
  console.log(
    C.yellow('  ! tanpa alias impor: periksa `admin.importMap.baseDir` — `puckViewComponent` di-resolve relatif terhadapnya.'),
  )
}
if (info.pagesTaken) {
  console.log(
    C.yellow(
      `  ! collection \`pages\` sudah ada di proyek ini, jadi dipakai \`${ctx.pagesSlug}\`. Timpa dengan --pages-slug.`,
    ),
  )
}

// --- 2. rencana ---
const plan = []
const files = templates(ctx)

for (const file of files) {
  const abs = path.join(cwd, file.path)
  if (exists(abs)) {
    if (force) {
      plan.push({ ...file, abs, action: 'overwrite' })
    } else {
      plan.push({ ...file, abs, action: 'skip' })
    }
  } else {
    plan.push({ ...file, abs, action: 'create' })
  }
}

// stylesheet
if (args.styles !== false) {
  const cssAbs = path.join(groupDir, existingCss ?? 'styles.css')
  if (!existingCss) {
    plan.push({
      abs: cssAbs,
      action: 'create',
      contents: STYLES_CONTENTS,
      path: path.relative(cwd, cssAbs).split(path.sep).join('/'),
    })
  }
  // Stylesheet yang SUDAH ADA tidak disentuh sama sekali.
  //
  // Dulu di sini disuntikkan `@import 'payload-puck-advance/tokens.css'` dan
  // `@source` ke `node_modules`. Keduanya hilang bersama token milik paket: karena
  // seluruh class Tailwind sekarang berada di `src`, tidak ada apa pun dari paket
  // yang perlu diimpor — dan menambah baris ke stylesheet orang lain tanpa alasan
  // hanya menghasilkan diff yang harus dijelaskan.
}

// .env.example
if (args.env !== false) {
  const envAbs = path.join(cwd, '.env.example')
  const current = exists(envAbs) ? fs.readFileSync(envAbs, 'utf8') : ''
  const missing = ENV_KEYS.filter(([key]) => !current.includes(key))
  if (missing.length) {
    const block =
      `\n# --- payload-puck-advance ---\n` +
      missing.map(([k, v, note]) => `# ${note}\n${k}=${v}`).join('\n') +
      '\n'
    plan.push({
      abs: envAbs,
      action: exists(envAbs) ? 'append' : 'create',
      contents: block,
      note: `${missing.length} variabel`,
      path: '.env.example',
    })
  }
}

// config patch
let configPlan = null
if (args['config-patch'] !== false && info.configPath) {
  const abs = path.join(cwd, info.configPath)
  const source = fs.readFileSync(abs, 'utf8')
  const result = patchConfig(source, ctx)
  configPlan = { abs, path: info.configPath, ...result }
}

console.log('')
console.log(C.bold('Rencana'))

const label = {
  append: C.green('append  '),
  create: C.green('create  '),
  overwrite: C.yellow('overwrite'),
  skip: C.dim('skip    '),
}

for (const item of plan) {
  const extra = item.action === 'skip' ? C.dim('(sudah ada — pakai --force)') : (item.note ?? '')
  console.log(`  ${label[item.action]} ${item.path} ${C.dim(extra)}`)
}

if (configPlan) {
  if (configPlan.status === 'patched') {
    console.log(`  ${C.green('patch   ')} ${configPlan.path} ${C.dim(configPlan.notes.join('; '))}`)
  } else if (configPlan.status === 'already') {
    console.log(`  ${C.dim('skip    ')} ${configPlan.path} ${C.dim('(plugin sudah terpasang)')}`)
  } else {
    console.log(`  ${C.yellow('manual  ')} ${configPlan.path} ${C.dim(configPlan.reason)}`)
  }
} else if (args['config-patch'] !== false) {
  console.log(`  ${C.yellow('manual  ')} payload.config.ts ${C.dim('(file tidak ditemukan)')}`)
}

// dependency yang belum ada
const missingDeps = [
  !info.hasPlugin && 'payload-puck-advance',
  !info.hasLivePreviewPkg && '@payloadcms/live-preview-react',
  !info.hasTailwind && 'tailwindcss @tailwindcss/postcss',
].filter(Boolean)

if (dry) {
  console.log('')
  console.log(C.dim('Dry run — tidak ada file yang ditulis.'))
  printNext(missingDeps, configPlan, info, ctx)
  process.exit(0)
}

// --- 3. eksekusi ---
let written = 0
for (const item of plan) {
  if (item.action === 'skip') {
    continue
  }
  fs.mkdirSync(path.dirname(item.abs), { recursive: true })
  if (item.action === 'append') {
    fs.appendFileSync(item.abs, item.contents)
  } else {
    if (item.action === 'overwrite') {
      // Tanpa git, timpa berarti hilang. Backup dibuat apa pun yang terjadi.
      fs.copyFileSync(item.abs, `${item.abs}.bak`)
    }
    fs.writeFileSync(item.abs, item.contents)
  }
  written += 1
}

if (configPlan?.status === 'patched') {
  fs.copyFileSync(configPlan.abs, `${configPlan.abs}.bak`)
  fs.writeFileSync(configPlan.abs, configPlan.contents)
  written += 1
}

console.log('')
console.log(C.green(`✓ ${written} file ditulis.`))
if (configPlan?.status === 'patched') {
  console.log(C.dim(`  Backup config: ${configPlan.path}.bak`))
}

printNext(missingDeps, configPlan, info, ctx)

function printNext(missing, cfg, detected, context) {
  console.log('')
  console.log(C.bold('Langkah berikutnya'))
  let n = 1
  if (missing.length) {
    console.log(`  ${n}. ${detected.packageManager} add ${missing.join(' ')}`)
    n += 1
  }
  if (cfg && cfg.status === 'manual') {
    console.log(`  ${n}. Tambal payload.config.ts manual:\n`)
    console.log(
      manualInstructions(context)
        .split('\n')
        .map((l) => `     ${l}`)
        .join('\n'),
    )
    n += 1
  }
  console.log(`  ${n}. ${detected.packageManager} run generate:importmap`)
  n += 1
  console.log(`  ${n}. Jalankan dev server, buat halaman dengan slug \`home\`.`)
  console.log('')
  console.log(
    C.dim(
      '  File berikut MILIK ANDA dan tidak akan ditimpa lagi:\n' +
        `    ${context.srcRel}blocks/              — definisi block Payload + komponen render\n` +
        `    ${context.srcRel}collections/Pages.ts — collection tempat plugin menempel\n` +
        `    ${context.srcRel}lib/cms.ts           — klien data ke REST API Payload\n` +
        '  Paket tidak membawa block, komponen, maupun CSS apa pun.',
    ),
  )
  console.log('')
}
