import path from 'node:path'

import { configSnippet, livePreviewSnippet } from './templates.mjs'

const PLUGIN_IMPORT = "import { payloadPuckAdvance } from 'payload-puck-advance'"
const ANCHOR = '@puck-advance:plugins'

/**
 * Path impor ke collection yang baru di-scaffold, dihitung dari lokasi config.
 *
 * Config tidak selalu bersebelahan dengan `src`: ada yang menaruhnya di root
 * proyek. Memakai `./collections/Pages` di kasus itu menghasilkan impor yang gagal
 * saat build, jauh dari tempat kesalahannya dibuat.
 */
const pagesImport = (ctx) => {
  if (ctx.alias) {
    return `import { Pages } from '${ctx.alias}/collections/Pages'`
  }
  const fromDir = path.posix.dirname((ctx.configPath ?? 'payload.config.ts').split(path.sep).join('/'))
  const to = path.posix.join(ctx.srcRel === '' ? '.' : ctx.srcRel, 'collections/Pages')
  let rel = path.posix.relative(fromDir, to)
  if (!rel.startsWith('.')) {
    rel = `./${rel}`
  }
  return `import { Pages } from '${rel}'`
}

/**
 * Menyisipkan plugin ke `payload.config.ts`.
 *
 * Dilakukan dengan anchor comment dan pencarian teks, BUKAN rewriting AST
 * TypeScript. AST terlihat lebih pintar, tapi config Payload di proyek nyata
 * sangat bervariasi — dibungkus fungsi, di-spread dari file lain, plugin-nya
 * hasil `.map()` — dan AST gagal secara halus di kasus-kasus itu. Pencarian
 * teks gagal secara TERBUKA: kalau tidak yakin, ia menolak menyentuh file dan
 * mencetak potongan untuk ditempel manual.
 *
 * Mengembalikan `{ contents, status, reason }`. Status `manual` berarti file
 * tidak diubah dan pengguna harus menempel sendiri.
 */
export const patchConfig = (source, ctx) => {
  if (/payloadPuckAdvance\s*\(/.test(source)) {
    return { status: 'already', contents: source }
  }

  let out = source
  const notes = []

  // --- import ---
  if (!out.includes(PLUGIN_IMPORT)) {
    const imports = [...out.matchAll(/^import .*$/gm)]
    if (imports.length === 0) {
      return {
        reason: 'tidak ada satu pun baris import yang bisa dijadikan patokan',
        status: 'manual',
      }
    }
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    out = `${out.slice(0, at)}\n${PLUGIN_IMPORT}${out.slice(at)}`
  }

  // --- plugins ---
  const anchorAt = out.indexOf(ANCHOR)
  if (anchorAt !== -1) {
    const lineEnd = out.indexOf('\n', anchorAt)
    out = `${out.slice(0, lineEnd + 1)}${configSnippet(ctx)}\n${out.slice(lineEnd + 1)}`
    notes.push('disisipkan pada anchor comment')
  } else {
    const m = out.match(/plugins\s*:\s*\[/)
    if (m) {
      const at = m.index + m[0].length
      const rest = out.slice(at)
      // Array kosong (`plugins: []`) menutup di baris yang sama, jadi tanpa
      // ini hasilnya `}),]` — sah secara sintaks, tapi terlihat seperti
      // tempelan mesin, dan itu membuat orang curiga pada seluruh patch-nya.
      const closesInline = /^[^\n\]]*\]/.test(rest)
      out = `${out.slice(0, at)}\n${configSnippet(ctx)}${closesInline ? '\n  ' : ''}${rest}`
      notes.push('disisipkan ke array `plugins`')
    } else {
      // Config tanpa `plugins` sama sekali. Menambahkannya berarti menebak di
      // mana batas objek `buildConfig` — justru kasus yang paling mudah salah.
      return {
        reason: 'array `plugins: [` tidak ditemukan',
        status: 'manual',
      }
    }
  }

  // --- collections ---
  //
  // WAJIB, bukan kenyamanan: plugin ini MENEMPEL pada collection yang sudah ada dan
  // melempar error saat boot kalau slug-nya tidak terdaftar. Tanpa langkah ini
  // scaffold-nya menghasilkan proyek yang mati sejak perintah pertama.
  if (!new RegExp(`collections\\s*:\\s*\\[[^\\]]*\\bPages\\b`).test(out)) {
    const m = out.match(/collections\s*:\s*\[/)
    if (m) {
      const imp = pagesImport(ctx)
      if (!out.includes(imp)) {
        const imports = [...out.matchAll(/^import .*$/gm)]
        const last = imports[imports.length - 1]
        const at = last.index + last[0].length
        out = `${out.slice(0, at)}\n${imp}${out.slice(at)}`
      }
      const at2 = out.match(/collections\s*:\s*\[/)
      const insertAt = at2.index + at2[0].length
      const rest = out.slice(insertAt)
      const closesInline = /^[^\n\]]*\]/.test(rest)
      out = `${out.slice(0, insertAt)}${closesInline ? 'Pages' : '\n    Pages,'}${
        closesInline && !/^\s*\]/.test(rest) ? ', ' : ''
      }${rest}`
      notes.push('`Pages` didaftarkan ke `collections`')
    } else {
      notes.push('array `collections: [` tidak ditemukan — daftarkan `Pages` manual')
    }
  }

  // --- livePreview ---
  if (!ctx.hasLivePreview) {
    const m = out.match(/admin\s*:\s*\{/)
    if (m) {
      const at = m.index + m[0].length
      const rest = out.slice(at)
      // `admin: { user: 'users' }` menutup di baris yang sama; tanpa ini
      // sisa propertinya menempel di belakang blok livePreview.
      const inline = /^[^\n}]*}/.test(rest)
      out = `${out.slice(0, at)}\n${livePreviewSnippet(ctx)}${inline ? '\n  ' : ''}${rest}`
      notes.push('livePreview ditambahkan ke `admin`')
    } else {
      notes.push('blok `admin` tidak ada — tambahkan livePreview manual')
    }
  }

  return { contents: out, notes, status: 'patched' }
}

/** Potongan untuk ditempel manual saat patching menolak menyentuh file. */
export const manualInstructions = (ctx) =>
  [
    `1. Tambahkan import:\n\n   ${PLUGIN_IMPORT}`,
    `2. Daftarkan collection-nya — plugin MENEMPEL padanya dan gagal saat boot kalau\n   slug-nya tidak terdaftar:\n\n   ${pagesImport(ctx)}\n   // lalu tambahkan \`Pages\` ke array \`collections\``,
    `3. Tambahkan ke array \`plugins\`:\n\n${configSnippet(ctx)}`,
    ctx.hasLivePreview
      ? null
      : `4. Tambahkan ke \`admin\`:\n\n${livePreviewSnippet(ctx)}`,
    `Tip: taruh komentar \`// ${ANCHOR}\` di dalam array \`plugins\` supaya \`init\` berikutnya bisa menyisipkan sendiri.`,
  ]
    .filter(Boolean)
    .join('\n\n')

export const ANCHOR_COMMENT = ANCHOR
