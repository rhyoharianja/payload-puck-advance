import type { Config } from 'payload'

export type PluginFactory = (config: Config) => Config

export type RevalidateConfig = {
  /** Endpoint di frontend yang memicu purge cache. */
  url: string
  /** Shared secret; dikirim sebagai header `x-revalidate-secret`. */
  secret: string
  /** Header tambahan bila frontend butuh autentikasi lain. */
  headers?: Record<string, string>
}

export type PuckAdvanceConfig = {
  /**
   * Collection yang mendapat penyunting Puck. WAJIB.
   *
   * Paket ini MENEMPEL pada collection yang sudah ada — ia tidak membuat
   * collection, tidak mendaftarkan block, dan tidak membawa komponen. Definisi
   * blok milik Payload (di aplikasi Anda atau proyek yang sudah jalan), dan
   * panel field Puck diturunkan dari definisi itu.
   */
  collections: string[]
  /** Nama field blocks pada collection tersebut. Default `layout`. */
  field?: string
  /**
   * Komponen view Puck, format `path#Export`.
   *
   * Harus disediakan aplikasi: view-nya perlu `renderMap` — pemetaan slug block ke
   * komponen React MILIK APLIKASI — dan config server tidak boleh mengimpor kode
   * client. Buat dengan `createPuckView({ renderMap })`.
   */
  puckViewComponent: string
  /**
   * Pemilih mode penyunting di kontrol dokumen, format `path#Export`.
   *
   * Default: komponen siap pakai paket ini. Ia mengganti ikon mata Live Preview
   * dengan dropdown Form / Live Preview / Puck.
   */
  previewModeComponent?: string
  /** Path view Puck relatif terhadap dokumen. Default `/puck`. */
  puckViewPath?: `/${string}`
  /** Matikan plugin tanpa mengubah apa pun di config. */
  disabled?: boolean
  /**
   * Webhook purge cache saat dokumen dipublish.
   *
   * Frontend adalah service terpisah dengan cache sendiri dan TIDAK tahu apa pun
   * soal publish — tanpa ini, konten baru baru muncul saat TTL habis.
   */
  revalidate?: false | RevalidateConfig
}

export type ResolvedOptions = {
  collections: string[]
  field: string
  previewModeComponent: string
  puckViewComponent: string
  puckViewPath: `/${string}`
  revalidate: false | RevalidateConfig
}
