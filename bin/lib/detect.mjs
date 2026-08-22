import fs from 'node:fs'
import path from 'node:path'

const exists = (p) => {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

const readJson = (p) => {
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    // Baru di sini komentar dihapus, dan HANYA komentar baris.
    //
    // Menghapus komentar blok dengan regex adalah jebakan: tsconfig penuh glob
    // seperti `"**/*.ts"`, dan `/*` di dalam string itu terbaca sebagai awal
    // komentar sehingga separuh file ikut terhapus — parse-nya lalu gagal
    // sunyi dan alias dianggap tidak ada.
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '')
    try {
      return JSON.parse(stripped)
    } catch {
      return null
    }
  }
}

const walk = (dir, depth = 0, out = []) => {
  if (depth > 4 || !exists(dir)) {
    return out
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, depth + 1, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Deteksi bentuk proyek.
 *
 * Sengaja tidak mengasumsikan struktur `create-payload-app`: proyek yang sudah
 * jalan berbulan-bulan hampir pasti sudah menyimpang darinya — route group
 * bernama lain, `src/` yang tidak ada, alias selain `@`. Setiap dugaan di sini
 * bisa ditimpa lewat flag, dan yang tidak bisa ditebak dilaporkan sebagai
 * langkah manual alih-alih ditebak-tebak.
 */
export const detect = (cwd, overrides = {}) => {
  const pkgPath = path.join(cwd, 'package.json')
  const pkg = readJson(pkgPath)

  if (!pkg) {
    return { error: `Tidak ada package.json di ${cwd}. Jalankan dari root proyek Payload Anda.` }
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  if (!deps.payload) {
    return { error: 'Paket `payload` tidak ada di package.json — ini bukan proyek Payload.' }
  }

  // --- src root ---
  const srcRoot = overrides.srcRoot ?? (exists(path.join(cwd, 'src')) ? 'src' : '.')

  // --- app dir ---
  const appDir =
    overrides.appDir ??
    ['src/app', 'app'].find((c) => exists(path.join(cwd, c))) ??
    null

  // --- route group frontend ---
  let routeGroup = overrides.routeGroup ?? null
  let groupCandidates = []
  if (appDir && routeGroup === null) {
    groupCandidates = fs
      .readdirSync(path.join(cwd, appDir), { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\(.+\)$/.test(e.name) && e.name !== '(payload)')
      .map((e) => e.name)

    if (groupCandidates.length === 1) {
      routeGroup = groupCandidates[0]
    } else if (groupCandidates.length > 1) {
      // Yang punya layout.tsx paling mungkin jadi shell frontend.
      routeGroup =
        groupCandidates.find((g) => exists(path.join(cwd, appDir, g, 'layout.tsx'))) ??
        groupCandidates[0]
    } else {
      routeGroup = '' // tanpa route group; route ditaruh langsung di app/
    }
  }

  // --- alias impor ---
  let alias = overrides.alias ?? null
  if (alias === null) {
    const tsconfig = readJson(path.join(cwd, 'tsconfig.json'))
    const paths = tsconfig?.compilerOptions?.paths ?? {}
    const hit = Object.entries(paths).find(
      ([key, val]) => key.endsWith('/*') && String(val?.[0] ?? '').replace(/^\.\//, '').startsWith(`${srcRoot}/`),
    )
    alias = hit ? hit[0].slice(0, -2) : null
  }

  // --- payload.config.ts ---
  const configPath =
    overrides.configPath ??
    ['src/payload.config.ts', 'payload.config.ts', 'src/payload/config.ts'].find((c) =>
      exists(path.join(cwd, c)),
    ) ??
    null

  // --- slug collection ---
  const files = walk(path.join(cwd, srcRoot === '.' ? '' : srcRoot))
  let pagesTaken = false

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    if (/slug\s*:\s*['"]pages['"]/.test(text)) {
      pagesTaken = true
    }
  }

  const packageManager = exists(path.join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : exists(path.join(cwd, 'yarn.lock'))
      ? 'yarn'
      : exists(path.join(cwd, 'bun.lockb'))
        ? 'bun'
        : 'npm'

  return {
    alias,
    appDir,
    configPath,
    cwd,
    groupCandidates,
    hasLivePreview: configPath
      ? /livePreview\s*:/.test(fs.readFileSync(path.join(cwd, configPath), 'utf8'))
      : false,
    hasPlugin: Boolean(deps['payload-puck-advance']),
    hasLivePreviewPkg: Boolean(deps['@payloadcms/live-preview-react']),
    hasTailwind: Boolean(deps.tailwindcss),
    packageManager,
    routeGroup,
    pagesSlug: overrides.pagesSlug ?? (pagesTaken ? 'puck-pages' : 'pages'),
    pagesTaken,
    srcRoot,
  }
}

export { exists }
