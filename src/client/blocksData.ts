'use client'

import type { PayloadBlock } from './fromPayloadBlocks.js'

/**
 * Konversi array blocks Payload ⇄ data Puck.
 *
 * Nama field bertipe slot diambil dari DEFINISI BLOCK PAYLOAD, bukan dari daftar
 * yang dirawat terpisah. Itu yang membuat konverter ini bekerja pada proyek Payload
 * mana pun: apa pun blok yang Anda punya, slot-nya ditemukan dari definisinya
 * sendiri.
 */

export type BlockRow = Record<string, unknown> & { blockType?: string; id?: string }

export type PuckNode = { props?: Record<string, unknown>; type?: string }

export type PuckData = {
  content?: PuckNode[]
  root?: { props?: Record<string, unknown> }
}

export const EMPTY_PUCK_DATA: PuckData = { content: [], root: { props: {} } }

/** Nama field bertipe `blocks` (slot) untuk sebuah block, dari definisinya. */
const slotNames = (block: PayloadBlock | undefined): string[] =>
  (block?.fields ?? [])
    .filter((f) => f.type === 'blocks' && typeof f.name === 'string')
    .map((f) => f.name as string)

const MAX_DEPTH = 12

const rowToNode = (
  row: BlockRow,
  bySlug: Map<string, PayloadBlock>,
  depth: number,
): null | PuckNode => {
  const slug = row.blockType
  if (depth > MAX_DEPTH || !slug || !bySlug.has(slug)) {
    return null
  }

  const { blockName: _blockName, blockType: _blockType, id, ...rest } = row
  const props: Record<string, unknown> = { ...rest }

  for (const name of slotNames(bySlug.get(slug))) {
    const raw = props[name]
    props[name] = Array.isArray(raw)
      ? (raw as BlockRow[])
          .map((child) => rowToNode(child, bySlug, depth + 1))
          .filter((n): n is PuckNode => n !== null)
      : []
  }

  // Puck menuntut `id` unik di props. Id baris Payload dipakai apa adanya supaya
  // seleksi di canvas tetap menunjuk baris yang sama setelah reload.
  props.id = id != null ? String(id) : `${slug}-${depth}-${Math.abs(hash(JSON.stringify(rest)))}`

  return { props, type: slug }
}

/** Hash kecil untuk id sementara pada baris yang belum punya id dari Payload. */
const hash = (input: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h | 0
}

export const blocksToPuckData = (
  rows: BlockRow[] | null | undefined,
  blocks: PayloadBlock[],
): PuckData => {
  const bySlug = new Map(blocks.map((b) => [b.slug, b]))
  return {
    content: (rows ?? [])
      .map((row) => rowToNode(row, bySlug, 0))
      .filter((n): n is PuckNode => n !== null),
    root: { props: {} },
  }
}

const nodeToRow = (
  node: PuckNode,
  bySlug: Map<string, PayloadBlock>,
  depth: number,
): BlockRow | null => {
  const slug = node.type
  if (depth > MAX_DEPTH || !slug || !bySlug.has(slug)) {
    return null
  }

  /*
   * `id` SENGAJA dibuang, tidak diteruskan ke Payload.
   *
   * Id baris Payload dan id komponen Puck bukan hal yang sama: Puck membuat id
   * sendiri untuk komponen yang baru dijatuhkan, dan bentuknya belum tentu sah
   * sebagai id baris. Membiarkan Payload menetapkannya selalu benar; harganya id
   * baris berganti setiap simpan, dan itu tidak berpengaruh pada datanya.
   */
  const { id: _id, ...rest } = node.props ?? {}
  const row: BlockRow = { ...rest, blockType: slug }

  for (const name of slotNames(bySlug.get(slug))) {
    const raw = row[name]
    row[name] = Array.isArray(raw)
      ? (raw as PuckNode[])
          .map((child) => nodeToRow(child, bySlug, depth + 1))
          .filter((r): r is BlockRow => r !== null)
      : []
  }

  return row
}

export const puckDataToBlocks = (
  data: null | PuckData | undefined,
  blocks: PayloadBlock[],
): BlockRow[] => {
  const bySlug = new Map(blocks.map((b) => [b.slug, b]))
  return (data?.content ?? [])
    .map((node) => nodeToRow(node, bySlug, 0))
    .filter((r): r is BlockRow => r !== null)
}
