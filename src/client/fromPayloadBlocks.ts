'use client'

/**
 * Menurunkan config Puck dari DEFINISI BLOCK PAYLOAD.
 *
 * Ini yang membuat Puck benar-benar hanya merender, dan membuat paket ini bekerja
 * di proyek Payload yang sudah ada: tidak ada contract yang harus ditulis, tidak
 * ada katalog kedua. Blok didefinisikan sekali di Payload — di boilerplate atau di
 * proyek yang sudah jalan — dan panel field Puck dibentuk dari definisi itu.
 *
 * Aplikasi hanya menyediakan `renderMap`: slug block → komponen React miliknya.
 */

/** Bentuk minimal field Payload yang dibutuhkan di sisi client. */
type PayloadField = {
  blockReferences?: (string | { slug?: string })[]
  blocks?: PayloadBlock[]
  fields?: PayloadField[]
  hasMany?: boolean
  label?: unknown
  name?: string
  options?: (string | { label?: unknown; value?: string })[]
  type: string
}

export type PayloadBlock = {
  fields?: PayloadField[]
  labels?: { plural?: unknown; singular?: unknown }
  slug: string
}

/**
 * Label Payload bisa berupa string ATAU objek terjemahan (`{ en, id, … }`).
 * Diambil apa adanya kalau string; kalau objek, nilai pertama yang berupa string.
 */
const labelOf = (label: unknown, fallback: string): string => {
  if (typeof label === 'string') {
    return label
  }
  if (label && typeof label === 'object') {
    const first = Object.values(label as Record<string, unknown>).find(
      (v) => typeof v === 'string',
    )
    if (typeof first === 'string') {
      return first
    }
  }
  return fallback
}

const humanize = (name: string): string =>
  name.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase())

/**
 * Tipe field Payload yang SENGAJA dilewatkan, bukan dipaksa masuk Puck.
 *
 * `richText` yang paling penting di daftar ini: isinya Lexical JSON, dan
 * menyuguhkannya sebagai textarea di Puck berarti editor bisa menimpanya dengan
 * teks biasa — datanya rusak tanpa peringatan. Field seperti ini tetap disunting
 * di form bawaan Payload; Puck hanya tidak menawarkannya.
 */
const UNSUPPORTED = new Set([
  'richText',
  'upload',
  'relationship',
  'join',
  'point',
  'date',
  'code',
  'json',
  'ui',
])

export const unsupportedFieldTypes = (): string[] => [...UNSUPPORTED]

type PuckField = Record<string, unknown>

const toPuckField = (
  field: PayloadField,
  blockBySlug: Map<string, PayloadBlock>,
  depth: number,
): null | PuckField => {
  const label = labelOf(field.label, humanize(field.name ?? ''))

  if (UNSUPPORTED.has(field.type)) {
    return null
  }

  switch (field.type) {
    case 'array':
      return {
        arrayFields: fieldsToPuck(field.fields ?? [], blockBySlug, depth + 1),
        label,
        type: 'array',
      }

    case 'blocks': {
      // Field blocks bersarang menjadi SLOT: editor menjatuhkan blok ke dalamnya,
      // dan isinya disimpan kembali sebagai blocks Payload.
      return { label, type: 'slot' }
    }

    case 'checkbox':
      // Puck tidak punya field boolean. Dijadikan radio dua nilai, dan nilainya
      // tetap boolean supaya Payload menerimanya apa adanya.
      return {
        label,
        options: [
          { label: 'Ya', value: true },
          { label: 'Tidak', value: false },
        ],
        type: 'radio',
      }

    case 'group':
      return {
        label,
        objectFields: fieldsToPuck(field.fields ?? [], blockBySlug, depth + 1),
        type: 'object',
      }

    case 'number':
      return { label, type: 'number' }

    case 'radio':
    case 'select':
      return {
        label,
        options: (field.options ?? []).map((o) =>
          typeof o === 'string'
            ? { label: humanize(o), value: o }
            : { label: labelOf(o.label, humanize(o.value ?? '')), value: o.value },
        ),
        type: 'select',
      }

    case 'text':
      return { label, type: 'text' }

    case 'textarea':
      return { label, type: 'textarea' }

    default:
      return null
  }
}

/**
 * `row`, `collapsible`, dan `tabs` hanya pengelompokan tampilan di Payload — ia
 * tidak menambah kedalaman pada DATA. Anaknya diangkat ke level yang sama, kalau
 * tidak field di dalamnya hilang dari panel Puck tanpa jejak.
 */
const fieldsToPuck = (
  fields: PayloadField[],
  blockBySlug: Map<string, PayloadBlock>,
  depth: number,
): Record<string, PuckField> => {
  const out: Record<string, PuckField> = {}
  if (depth > 8) {
    return out
  }

  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      Object.assign(out, fieldsToPuck(field.fields ?? [], blockBySlug, depth))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of (field as { tabs?: PayloadField[] }).tabs ?? []) {
        Object.assign(out, fieldsToPuck(tab.fields ?? [], blockBySlug, depth))
      }
      continue
    }
    if (!field.name) {
      continue
    }
    const puck = toPuckField(field, blockBySlug, depth)
    if (puck) {
      out[field.name] = puck
    }
  }

  return out
}

export type DerivedConfig = {
  categories?: Record<string, { components: string[] }>
  components: Record<string, { fields: Record<string, PuckField>; label: string; render: unknown }>
}

export type DeriveOptions = {
  /** Definisi block dari Payload — hasil resolusi `blocks` + `blockReferences`. */
  blocks: PayloadBlock[]
  /** slug block → komponen React milik aplikasi. */
  renderMap: Record<string, unknown>
  /** Dipanggil untuk block yang tidak punya komponen render. */
  onMissingRender?: (slug: string) => void
}

/**
 * Config Puck dari definisi block Payload.
 *
 * Block yang tidak punya komponen render DILEWATKAN, bukan dijadikan error:
 * proyek yang sudah ada bisa punya blok yang memang tidak dimaksudkan untuk
 * dirender visual, dan menggagalkan seluruh editor karena satu blok jauh lebih
 * mahal daripada tidak menawarkannya.
 */
export const puckConfigFromPayloadBlocks = (opts: DeriveOptions): DerivedConfig => {
  const blockBySlug = new Map(opts.blocks.map((b) => [b.slug, b]))
  const components: DerivedConfig['components'] = {}

  for (const block of opts.blocks) {
    const render = opts.renderMap[block.slug]
    if (!render) {
      opts.onMissingRender?.(block.slug)
      continue
    }

    components[block.slug] = {
      fields: fieldsToPuck(block.fields ?? [], blockBySlug, 0),
      label: labelOf(block.labels?.singular, humanize(block.slug)),
      render,
    }
  }

  return { components }
}

/**
 * Mengumpulkan definisi block untuk satu field dari config client Payload.
 *
 * Menangani dua bentuk sekaligus: `blocks` inline, dan `blockReferences` yang
 * menunjuk registry root. Bentuk kedua yang dipakai Payload untuk menghindari
 * duplikasi definisi, dan referensinya bisa berupa string maupun objek.
 */
export const collectBlocks = (
  field: PayloadField | undefined,
  rootBlocks: PayloadBlock[] = [],
): PayloadBlock[] => {
  if (!field) {
    return []
  }

  const bySlug = new Map(rootBlocks.map((b) => [b.slug, b]))
  const out: PayloadBlock[] = []

  for (const b of field.blocks ?? []) {
    out.push(b)
  }

  for (const ref of field.blockReferences ?? []) {
    const slug = typeof ref === 'string' ? ref : ref.slug
    if (!slug) {
      continue
    }
    const found = bySlug.get(slug)
    if (found && !out.some((b) => b.slug === slug)) {
      out.push(found)
    }
  }

  return out
}
