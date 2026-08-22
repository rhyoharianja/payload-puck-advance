// Ekstensi `.js` bukan salah tulis: paket `next` tidak punya field `exports`,
// jadi di bawah resolusi `nodenext` subpath-nya di-resolve sebagai path file
// biasa dan wajib menyertakan ekstensi.
import { revalidateTag } from 'next/cache.js'

export type RevalidateRouteOptions = {
  /**
   * Shared secret. Kalau kosong, endpoint menolak SEMUA permintaan.
   *
   * Gagal tertutup, bukan terbuka: endpoint purge cache tanpa secret adalah
   * tombol yang bisa ditekan siapa pun.
   */
  secret: string | undefined
  /**
   * Profil cache life Next 16. `max` dipakai supaya entri dianggap kedaluwarsa
   * apa pun profil yang menempel pada fetch aslinya — publish harus terlihat
   * sekarang, bukan pada siklus revalidate berikutnya.
   */
  profile?: string
}

/**
 * Handler POST untuk dipanggil hook `afterChange` Payload saat halaman
 * dipublish.
 *
 * Tanpa ini, frontend tidak akan pernah tahu ada publish — ia service terpisah
 * dengan cache-nya sendiri, dan konten baru baru muncul saat TTL habis.
 */
export const createRevalidateRoute = (opts: RevalidateRouteOptions) => {
  const profile = opts.profile ?? 'max'

  return async (req: Request): Promise<Response> => {
    if (!opts.secret) {
      return Response.json({ error: 'Secret revalidate belum diset.' }, { status: 500 })
    }
    if (req.headers.get('x-revalidate-secret') !== opts.secret) {
      return Response.json({ error: 'Secret tidak cocok.' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as { tags?: string[] }
    const tags = body.tags ?? []

    for (const tag of tags) {
      revalidateTag(tag, profile)
    }

    return Response.json({ revalidated: tags })
  }
}
