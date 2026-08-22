import type { CollectionAfterChangeHook } from 'payload'

import type { RevalidateConfig } from '../types.js'

/**
 * Memberi tahu frontend bahwa satu halaman perlu di-purge.
 *
 * Ini bagian yang mudah terlupakan pada arsitektur runtime-render: frontend
 * adalah service terpisah dengan cache sendiri, dan ia TIDAK tahu apa pun soal
 * publish. Tanpa hook ini, "otomatis render data baru" tidak terjadi sampai TTL
 * cache habis.
 *
 * Purge per tag, bukan seluruh situs — memurge semuanya karena satu halaman
 * berubah membuang cache yang masih sah dan terasa sebagai lonjakan latensi.
 */
export const buildRevalidateHook = (
  cfg: RevalidateConfig,
  pagesSlug: string,
): CollectionAfterChangeHook => {
  return async ({ doc, previousDoc, req }) => {
    const status = (doc as { _status?: string })._status
    const prevStatus = (previousDoc as { _status?: string } | undefined)?._status

    // Draft tidak pernah memicu revalidate — justru itu inti pemisahannya.
    if (status !== 'published') {
      return doc
    }

    const slug = (doc as { slug?: string }).slug
    const tags = [`${pagesSlug}:${slug ?? ''}`]

    // Slug yang berubah membuat URL lama menjadi basi juga, jadi keduanya dipurge.
    const prevSlug = (previousDoc as { slug?: string } | undefined)?.slug
    if (prevSlug && prevSlug !== slug) {
      tags.push(`${pagesSlug}:${prevSlug}`)
    }

    try {
      const res = await fetch(cfg.url, {
        body: JSON.stringify({ collection: pagesSlug, slug, tags, wasDraft: prevStatus !== 'published' }),
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': cfg.secret,
          ...cfg.headers,
        },
        method: 'POST',
      })
      if (!res.ok) {
        req.payload.logger.warn(
          `[puck-advance] revalidate gagal (${res.status}) untuk ${tags.join(', ')}`,
        )
      }
    } catch (err) {
      // Publish TIDAK boleh gagal hanya karena frontend sedang tidak bisa
      // dihubungi — konten sudah tersimpan, dan cache akan kedaluwarsa sendiri.
      req.payload.logger.error(
        `[puck-advance] revalidate error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    return doc
  }
}
