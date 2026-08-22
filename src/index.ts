import type { CollectionConfig, Config } from 'payload'

import type { PluginFactory, PuckAdvanceConfig, ResolvedOptions } from './types.js'

import { buildRevalidateHook } from './hooks/revalidate.js'

export * from './types.js'

/**
 * payload-puck-advance — penyunting visual Puck untuk collection Payload yang
 * SUDAH ADA.
 *
 * Tiga hal yang TIDAK dilakukan paket ini, dan ketiganya disengaja:
 *
 * 1. **Tidak membuat collection.** Ia menempel pada milik Anda.
 * 2. **Tidak mendaftarkan block.** Definisi layout/block/component adalah wewenang
 *    Payload — Anda mendefinisikannya sekali, form bawaan yang menambahkannya lewat
 *    tombol "Add …", dan panel field Puck DITURUNKAN dari definisi itu. Tidak ada
 *    katalog kedua yang bisa menyimpang.
 * 3. **Tidak membawa komponen.** Tampilan blok milik aplikasi; Anda menyuntikkannya
 *    lewat `renderMap`.
 *
 * Yang dikerjakannya: mengganti ikon mata Live Preview dengan pemilih mode,
 * mendaftarkan view Puck penuh layar per dokumen, mengonversi blocks ⇄ data Puck,
 * dan (opsional) memicu purge cache frontend saat publish.
 */
export const payloadPuckAdvance =
  (pluginOptions: PuckAdvanceConfig): PluginFactory =>
  (config: Config): Config => {
    const opts = resolveOptions(pluginOptions)

    if (opts.collections.length === 0) {
      throw new Error(
        '[puck-advance] opsi `collections` kosong. Sebutkan collection mana yang ' +
          'mendapat penyunting Puck — paket ini menempel pada collection yang sudah ada, ' +
          'ia tidak membuat collection sendiri.',
      )
    }

    const known = new Set((config.collections ?? []).map((c) => c.slug))
    for (const slug of opts.collections) {
      if (!known.has(slug)) {
        throw new Error(
          `[puck-advance] collection "${slug}" tidak ada di config. ` +
            'Daftarkan collection-nya lebih dulu, atau perbaiki opsi `collections`.',
        )
      }
    }

    if (pluginOptions.disabled) {
      return config
    }

    config.collections = (config.collections ?? []).map((collection) =>
      opts.collections.includes(collection.slug) ? attach(collection, opts) : collection,
    )

    return config
  }

const attach = (collection: CollectionConfig, opts: ResolvedOptions): CollectionConfig => {
  const layout = (collection.fields ?? []).find(
    (f) => (f as { name?: string }).name === opts.field,
  )

  if (!layout || (layout as { type?: string }).type !== 'blocks') {
    throw new Error(
      `[puck-advance] collection "${collection.slug}" tidak punya field blocks bernama ` +
        `"${opts.field}". Penyunting ini merender field blocks — buat field-nya lebih ` +
        'dulu, atau set opsi `field` ke nama yang benar.',
    )
  }

  if (!collection.versions || !(collection.versions as { drafts?: unknown }).drafts) {
    // Bukan error: draft memang opsional di Payload. Tapi tanpanya, menyimpan dari
    // Puck langsung mengubah dokumen yang terbit — dan itu harus disadari, bukan
    // ditemukan belakangan.
    console.warn(
      `[puck-advance] collection "${collection.slug}" tidak mengaktifkan drafts. ` +
        'Menyimpan dari Puck akan langsung mengubah dokumen yang terbit.',
    )
  }

  const next: CollectionConfig = { ...collection }

  next.admin = {
    ...collection.admin,
    components: {
      ...collection.admin?.components,
      edit: {
        ...collection.admin?.components?.edit,
        /*
         * Pemilih mode disisipkan di kontrol dokumen, sebaris dengan Save Draft dan
         * Publish. Komponennya sekalian menyembunyikan toggler Live Preview bawaan,
         * jadi ikon mata efektif berganti menjadi dropdown.
         *
         * Slot `PreviewButton` TIDAK dipakai: ia hanya dirender kalau
         * `admin.preview` dikonfigurasi, sedangkan ikon mata yang muncul untuk
         * `admin.livePreview` adalah komponen lain tanpa slot pengganti.
         */
        beforeDocumentControls: [
          ...(collection.admin?.components?.edit?.beforeDocumentControls ?? []),
          opts.previewModeComponent,
        ],
      },
      /*
       * `views` dibangun dengan cast, dan alasannya di tipe Payload sendiri:
       * `EditConfig` adalah union antara "punya root" dan "punya custom view", dan
       * menyebar (`...`) view yang sudah ada membuat TypeScript melihat `root?:
       * undefined` — yang tidak cocok dengan index signature custom view. Tidak ada
       * cara menuliskannya tanpa cast selama union itu masih berbentuk demikian.
       */
      views: {
        ...collection.admin?.components?.views,
        edit: {
          ...collection.admin?.components?.views?.edit,
          /*
           * SENGAJA tanpa `tab`: dengan tab, mengkliknya menavigasi di tab yang
           * sama — sementara canvas butuh seluruh layar dan tidak boleh hidup di
           * dalam form edit Payload (`Puck.Fields` selalu merender `<form>`, yang
           * di sana menjadi form bersarang dan memicu hydration error).
           */
          puck: { Component: opts.puckViewComponent, path: opts.puckViewPath },
        },
      } as CollectionConfig['admin'] extends undefined
        ? never
        : NonNullable<NonNullable<CollectionConfig['admin']>['components']>['views'],
    },
  }

  if (opts.revalidate) {
    next.hooks = {
      ...collection.hooks,
      afterChange: [
        ...(collection.hooks?.afterChange ?? []),
        buildRevalidateHook(opts.revalidate, collection.slug),
      ],
    }
  }

  return next
}

const resolveOptions = (o: PuckAdvanceConfig): ResolvedOptions => ({
  collections: o.collections ?? [],
  field: o.field ?? 'layout',
  previewModeComponent:
    o.previewModeComponent ?? 'payload-puck-advance/client#PreviewModeSelect',
  puckViewComponent: o.puckViewComponent,
  puckViewPath: o.puckViewPath ?? '/puck',
  revalidate: o.revalidate ?? false,
})
