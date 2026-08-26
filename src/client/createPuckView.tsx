'use client'

import type { Config, Data } from '@puckeditor/core'
import type { CSSProperties, ReactNode } from 'react'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import { Puck } from '@puckeditor/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BlockRow, PuckData } from './blocksData.js'
import type { PayloadBlock } from './fromPayloadBlocks.js'

import { blocksToPuckData, EMPTY_PUCK_DATA, puckDataToBlocks } from './blocksData.js'
import { collectBlocks, puckConfigFromPayloadBlocks } from './fromPayloadBlocks.js'

export type PuckViewOptions = {
  /**
   * slug block → komponen React milik APLIKASI. Wajib.
   *
   * Paket ini tidak membawa satu pun blok atau komponen sendiri: definisinya milik
   * Payload, dan tampilannya milik aplikasi. Yang dikerjakan paket ini adalah
   * menurunkan panel field dari definisi Payload dan menyambungkan penyimpanannya.
   */
  renderMap: Record<string, unknown>
  /**
   * Mengelompokkan katalog block menjadi beberapa bagian yang bisa dilipat.
   *
   * Bentuknya `categories` milik Puck: kunci apa saja, `title` untuk judul yang
   * terlihat, `components` berisi slug block. Slug yang tidak masuk kelompok mana
   * pun jatuh ke bagian "other" milik Puck, jadi block baru tidak pernah hilang
   * dari katalog hanya karena lupa dimasukkan ke daftar.
   *
   * Tanpa ini katalog tampil sebagai satu daftar panjang. Untuk belasan block itu
   * cukup; untuk tiga puluh, editor harus menggulir tanpa tahu di mana batas
   * antar jenis.
   */
  categories?: Record<
    string,
    { components?: string[]; defaultExpanded?: boolean; title?: string; visible?: boolean }
  >
  /** Nama field blocks. Default `layout`. */
  fieldName?: string
  /**
   * Merender view sebagai lapisan penuh viewport di atas shell admin.
   * Default `true`.
   *
   * Tanpa ini canvas hanya mendapat sisa ruang di bawah header admin, judul
   * dokumen, dan tab Edit/Versions/API. Payload tidak mengizinkan
   * `views.edit.root` berdampingan dengan custom view (`root?: never`), jadi
   * mengambil alih layout lewat config bukan pilihan — menutupinya mencapai hasil
   * yang sama sambil tetap mempertahankan konteks dokumen Payload, termasuk
   * gerbang autentikasinya.
   */
  fullScreen?: boolean
  iframeOverride?: unknown
  /**
   * Menampilkan katalog block yang bisa ditarik ke canvas. Default `true`.
   *
   * Katalognya BUKAN daftar kedua: isinya diturunkan dari definisi block Payload
   * yang sama dengan yang membentuk panel field — lihat `fromPayloadBlocks`.
   * Menambah block di Payload otomatis memunculkannya di sini.
   *
   * Sempat sengaja disembunyikan dengan alasan "katalog kedua". Alasan itu
   * keliru, dan akibatnya nyata: blok baru hanya bisa ditambahkan lewat tombol
   * Add Layout di form Payload, sementara editor yang membuka Puck melihat
   * canvas tanpa satu pun cara menambah isi — terbaca sebagai editor yang rusak,
   * bukan sebagai keputusan desain.
   */
  showComponentList?: boolean
  /**
   * Halaman frontend yang stylesheet-nya dipinjam untuk canvas. Default `/`.
   *
   * Canvas Puck adalah iframe KOSONG tempat React merender — ia tidak memuat
   * halaman mana pun, jadi tanpa ini tidak punya CSS apa pun dan semuanya tampil
   * sebagai teks polos. Nama file CSS di-hash dan berubah tiap build, jadi yang
   * di-fetch adalah HALAMANNYA, lalu tag stylesheet-nya dibaca dari HTML-nya.
   */
  stylesheetFrom?: string
  /**
   * Menyalin stylesheet halaman admin ke canvas. Default `false` — kalau menyala,
   * canvas tampak seperti panel admin dan bukan seperti produksi.
   */
  syncHostStyles?: boolean
}

type Status = 'error' | 'idle' | 'loading' | 'saved' | 'saving'

/**
 * Geometri kedua tombol simpan — ditulis inline, bukan diserahkan ke class `.btn`
 * Payload.
 *
 * Class-nya dipertahankan supaya WARNA tetap mengikuti tema admin, tapi geometrinya
 * tidak bisa: di dalam DOM Puck, `.btn` menghasilkan tinggi 24px dengan padding NOL,
 * jadi teksnya menempel ke tepi dan tombolnya lebih pendek daripada undo/redo di
 * sebelahnya (32px). Style inline mengalahkan stylesheet, jadi ini memperbaiki
 * ukurannya tanpa menyentuh CSS admin milik siapa pun.
 *
 * Satuannya PIXEL, bukan rem: `rem` di konteks ini terhitung dari root 13px, jadi
 * `0.7rem` menjadi 9,1px — ukuran yang tidak pernah dimaksudkan siapa pun.
 */
const controlBase: CSSProperties = {
  alignItems: 'center',
  border: '1px solid transparent',
  borderRadius: 4,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 500,
  gap: 6,
  // Tinggi disamakan dengan tombol bawaan Puck di baris yang sama. Selisih 8px
  // pada baris yang sama terbaca sebagai "kurang rapi" jauh sebelum orang bisa
  // menunjuk penyebabnya.
  height: 32,
  justifyContent: 'center',
  lineHeight: 1,
  margin: 0,
  padding: '0 14px',
  whiteSpace: 'nowrap',
}

/**
 * View Puck untuk satu dokumen, dibuka di tab baru.
 *
 * Puck di sini HANYA MERENDER: blok didefinisikan di Payload (di aplikasi Anda,
 * atau di proyek Payload yang sudah jalan), form bawaan yang menambahkannya, dan
 * panel field Puck diturunkan dari definisi itu. Tidak ada katalog kedua, tidak ada
 * penyimpanan kedua — yang dibaca dan ditulis adalah array blocks yang sama.
 *
 * Konsekuensinya jujur: karena tab lain, ia tidak berbagi form state dengan halaman
 * edit, jadi ia menyimpan sendiri lewat REST API dengan `?draft=true`. Draft,
 * versioning, dan access control tetap milik Payload.
 */
export const createPuckView = (opts: PuckViewOptions) => {
  const field = opts.fieldName ?? 'layout'
  const showComponentList = opts.showComponentList ?? true

  const PuckView = () => {
    const [data, setData] = useState<Data>(EMPTY_PUCK_DATA as Data)
    const [status, setStatus] = useState<Status>('loading')
    const [message, setMessage] = useState<null | string>(null)
    const [docTitle, setDocTitle] = useState('')
    const [docStatus, setDocStatus] = useState<'draft' | 'published'>('draft')
    // Apa yang dilakukan simpan TERAKHIR — dipakai untuk pesan status. Dipisah dari
    // `docStatus`, karena menyimpan draft pada dokumen terbit membuat keduanya
    // berbeda: aksinya draft, dokumennya tetap terbit.
    const [savedAs, setSavedAs] = useState<'draft' | 'published'>('draft')

    // Data terbaru di ref supaya tombol Simpan tidak dibuat ulang tiap ketikan,
    // dan supaya penyimpanan selalu memakai nilai terkini.
    const latest = useRef<Data>(EMPTY_PUCK_DATA as Data)

    const { config: payloadConfig } = useConfig()
    const { collectionSlug, id: docId } = useDocumentInfo()
    const collection = collectionSlug ?? ''
    const id = docId != null ? String(docId) : ''

    /**
     * Definisi block diambil dari CONFIG CLIENT PAYLOAD.
     *
     * Menangani dua bentuk sekaligus — `blocks` inline dan `blockReferences` yang
     * menunjuk registry root — karena Payload memakai yang kedua untuk menghindari
     * duplikasi definisi, dan proyek yang sudah ada bisa memakai keduanya.
     */
    const blocks: PayloadBlock[] = useMemo(() => {
      const cfg = payloadConfig as unknown as
        | {
            blocks?: PayloadBlock[]
            collections?: { fields?: { name?: string; type: string }[]; slug: string }[]
          }
        | undefined

      const coll = cfg?.collections?.find((c) => c.slug === collection)
      const layoutField = coll?.fields?.find((f) => f.name === field && f.type === 'blocks')
      return collectBlocks(layoutField as never, cfg?.blocks ?? [])
    }, [collection, payloadConfig])

    const config = useMemo(() => {
      const built = puckConfigFromPayloadBlocks({
        blocks,
        onMissingRender: (slug) =>
          // Dilewatkan, bukan dijadikan error: proyek yang sudah ada bisa punya
          // blok yang memang tidak dimaksudkan untuk dirender visual, dan
          // menggagalkan seluruh editor karena satu blok jauh lebih mahal.
          console.warn(`[puck-advance] tidak ada komponen render untuk block "${slug}"`),
        renderMap: opts.renderMap,
      }) as unknown as Config

      if (!opts.categories) {
        return built
      }

      /*
       * Slug yang disebut di `categories` tapi TIDAK ada di config disaring.
       *
       * Puck menampilkan butir katalog untuk setiap slug yang disebut kelompok,
       * termasuk yang tidak punya komponen — hasilnya butir yang bisa diseret ke
       * canvas lalu meledak saat dirender. Daftar kelompok biasanya ditulis
       * tangan, jadi salah ketik di sana adalah hal yang wajar terjadi.
       */
      const known = new Set(Object.keys(built.components))
      const categories = Object.fromEntries(
        Object.entries(opts.categories).map(([key, category]) => [
          key,
          { ...category, components: category.components?.filter((slug) => known.has(slug)) },
        ]),
      )

      return { ...built, categories } as Config
    }, [blocks])

    useEffect(() => {
      if (!collection || !id) {
        return
      }
      let cancelled = false
      const load = async () => {
        try {
          // `draft=true`: yang disunting adalah versi kerja, bukan yang terbit.
          const res = await fetch(`/api/${collection}/${id}?draft=true&depth=2`, {
            credentials: 'include',
          })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const doc = (await res.json()) as Record<string, unknown>
          if (cancelled) {
            return
          }
          const next = blocksToPuckData(doc[field] as BlockRow[], blocks) as Data
          setData(next)
          latest.current = next
          setDocTitle(typeof doc.title === 'string' ? doc.title : '')
          setDocStatus(doc._status === 'published' ? 'published' : 'draft')
          setStatus('idle')
        } catch (err) {
          if (!cancelled) {
            setStatus('error')
            setMessage(err instanceof Error ? err.message : String(err))
          }
        }
      }
      void load()
      return () => {
        cancelled = true
      }
    }, [blocks, collection, id])

    /* --- stylesheet frontend untuk canvas --- */

    const [styleHrefs, setStyleHrefs] = useState<string[]>([])
    const [inlineStyles, setInlineStyles] = useState<string[]>([])

    useEffect(() => {
      let cancelled = false
      const load = async () => {
        try {
          const res = await fetch(opts.stylesheetFrom ?? '/', { credentials: 'include' })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
          if (cancelled) {
            return
          }
          setStyleHrefs(
            [...doc.querySelectorAll('link[rel="stylesheet"]')]
              .map((l) => l.getAttribute('href'))
              .filter((h): h is string => Boolean(h)),
          )
          setInlineStyles(
            [...doc.querySelectorAll('style')].map((el) => el.textContent ?? '').filter(Boolean),
          )
        } catch (err) {
          // Gagal ambil CSS tidak menggagalkan penyunting — canvas tampil tanpa
          // gaya, dan urutan blok masih bisa disusun.
          console.warn(
            `[puck-advance] gagal memuat stylesheet frontend: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }
      void load()
      return () => {
        cancelled = true
      }
    }, [])

    const iframeOverride = useMemo(() => {
      if (opts.iframeOverride) {
        return opts.iframeOverride
      }
      const Override = ({
        children,
        document: doc,
      }: {
        children: ReactNode
        document?: Document
      }) => {
        useEffect(() => {
          if (!doc) {
            return
          }
          const added: Element[] = []
          for (const href of styleHrefs) {
            if (doc.querySelector(`link[href="${href}"]`)) {
              continue
            }
            const link = doc.createElement('link')
            link.rel = 'stylesheet'
            link.href = href
            doc.head.appendChild(link)
            added.push(link)
          }
          for (const css of inlineStyles) {
            const style = doc.createElement('style')
            style.textContent = css
            doc.head.appendChild(style)
            added.push(style)
          }
          return () => added.forEach((el) => el.remove())
        }, [doc])

        return <>{children}</>
      }
      return Override
    }, [inlineStyles, styleHrefs])

    /* --- simpan --- */

    const onChange = useCallback((next: Data) => {
      latest.current = next
      setStatus('idle')
    }, [])

    /*
     * Target status adalah ARGUMEN, bukan state.
     *
     * Sebelumnya ia dibaca dari sebuah dropdown, sehingga tombol di sebelahnya
     * harus berganti label mengikuti pilihan — dan hasilnya satu baris berisi
     * dropdown "Terbitkan" tepat di sebelah tombol "Terbitkan", tanpa cara
     * membedakan mana yang memilih dan mana yang mengerjakan. Dua tombol dengan
     * maksud tetap menghilangkan pertanyaan itu seluruhnya.
     */
    const save = useCallback(
      async (target: 'draft' | 'published') => {
        setStatus('saving')
        setSavedAs(target)
        setMessage(null)
        try {
          const res = await fetch(`/api/${collection}/${id}?draft=true`, {
            /*
             * `draft=true` dipakai untuk KEDUA target. Payload memprioritaskan
             * `_status` yang eksplisit, jadi `published` tetap menerbitkan meski
             * permintaannya draft.
             */
            body: JSON.stringify({
              [field]: puckDataToBlocks(latest.current as PuckData, blocks),
              _status: target,
            }),
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            method: 'PATCH',
          })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          /*
           * Status dokumen dibaca dari JAWABAN, tidak disimpulkan dari target.
           *
           * Menyimpan draft pada dokumen yang sudah terbit TIDAK menariknya dari
           * publikasi — versi terbitnya tetap tayang dan yang bertambah hanya versi
           * kerja. Menandainya "Draft" di header akan berbohong soal apa yang
           * dilihat pengunjung.
           */
          const doc = (await res.json().catch(() => null)) as null | Record<string, unknown>
          const next = (doc?.doc ?? doc) as null | Record<string, unknown>
          if (next?._status === 'draft' || next?._status === 'published') {
            setDocStatus(next._status)
          }
          setStatus('saved')
        } catch (err) {
          setStatus('error')
          setMessage(err instanceof Error ? err.message : String(err))
        }
      },
      [blocks, collection, id],
    )

    // Ctrl/Cmd+S menyimpan. Tanpa ini, refleks pertama editor justru memicu dialog
    // simpan halaman milik browser.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          // Ctrl/Cmd+S menyimpan DRAFT, tidak pernah menerbitkan. Menerbitkan lewat
          // refleks pintasan adalah hal yang tidak bisa ditarik kembali.
          void save('draft')
        }
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [save])

    // Scroll halaman di belakang lapisan dikunci, kalau tidak menggulir di canvas
    // ikut menggulir halaman admin dan posisi lapisan terasa melayang.
    useEffect(() => {
      if (opts.fullScreen === false) {
        return
      }
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previous
      }
    }, [])

    /*
     * Kontrol simpan menggantikan tombol Publish milik Puck, di baris header
     * yang sama dengan undo/redo dan pemilih peranti.
     *
     * Sebelumnya ia berdiri di bar terpisah di atas Puck, jadi ada DUA baris
     * tombol yang keduanya terlihat seperti tombol utama halaman — dan yang
     * benar-benar menyimpan ke Payload justru yang di baris atas, bukan yang
     * bertuliskan "Publish".
     *
     * DUA TOMBOL, bukan dropdown + satu tombol. Bentuk sebelumnya menaruh pilihan
     * "Terbitkan" di dalam dropdown tepat di sebelah tombol bertuliskan
     * "Terbitkan": tidak ada yang menandai mana yang memilih dan mana yang
     * mengerjakan, dan tombolnya harus berganti label mengikuti dropdown supaya
     * tidak berbohong. Dua tombol dengan label tetap membuat kedua aksi terlihat
     * sekaligus dan menghapus pertanyaannya.
     *
     * `children` sengaja tidak dirender: isinya tombol Publish bawaan Puck, yang
     * menulis lewat `onPublish` dan melewati draft, versi, serta access control
     * Payload.
     */
    const headerActions = useCallback(
      () => (
        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <button
            className="btn btn--style-secondary"
            disabled={status === 'saving'}
            // Label kedua tombol ini TETAP, tidak mengikuti status dokumen. Label
            // yang berubah-ubah membuat otomasi bergantung pada state, dan membuat
            // editor harus membaca ulang tombolnya sebelum berani menekan.
            id="puck-advance-save"
            onClick={() => void save('draft')}
            style={{
              ...controlBase,
              background: 'var(--theme-input-bg, transparent)',
              border: '1px solid var(--theme-elevation-150, #d5d5d5)',
              color: 'inherit',
            }}
            title="Menyimpan perubahan tanpa menerbitkannya"
            type="button"
          >
            Simpan draft
          </button>

          <button
            className="btn btn--style-primary"
            disabled={status === 'saving'}
            id="puck-advance-publish"
            onClick={() => void save('published')}
            style={controlBase}
            title="Menyimpan dan menayangkan perubahan"
            type="button"
          >
            Terbitkan
          </button>
        </div>
      ),
      [save, status],
    )

    if (status === 'loading') {
      return <div style={{ padding: '2rem' }}>Memuat susunan halaman…</div>
    }


    const shell: CSSProperties =
      opts.fullScreen === false
        ? { display: 'flex', flexDirection: 'column', height: '100vh' }
        : {
            background: 'var(--theme-bg, #fff)',
            display: 'flex',
            flexDirection: 'column',
            inset: 0,
            position: 'fixed',
            zIndex: 60,
          }

    const editHref = collection && id ? `/admin/collections/${collection}/${id}` : '/admin'

    return (
      <div style={shell}>
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--theme-elevation-150, #e1e1e1)',
            display: 'flex',
            flexShrink: 0,
            gap: '1rem',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: '0.6rem', minWidth: 0 }}>
            {/*
              Tautan, bukan `history.back()`. View ini dibuka di tab baru, jadi
              riwayatnya kosong dan tombol back browser tidak menuju ke mana pun.
            */}
            <a
              aria-label="Kembali ke halaman edit"
              href={editHref}
              style={{
                alignItems: 'center',
                border: '1px solid var(--theme-elevation-150, #d0d0d0)',
                borderRadius: '4px',
                color: 'inherit',
                display: 'inline-flex',
                height: '2rem',
                justifyContent: 'center',
                textDecoration: 'none',
                width: '2rem',
              }}
              title="Kembali ke halaman edit"
            >
              <span aria-hidden>&#8592;</span>
            </a>
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {docTitle ? `Susunan: ${docTitle}` : 'Susunan halaman'}
            </strong>

            {/*
              Status dokumen sekarang ditampilkan, bukan disimpulkan.

              Dulu satu-satunya penanda status adalah dropdown di header — yang
              sebenarnya memilih AKSI, bukan melaporkan keadaan. Setelah dropdown itu
              diganti dua tombol, tanpa badge ini editor tidak punya cara tahu apakah
              yang sedang disuntingnya sudah tayang atau belum.
            */}
            <span
              id="puck-advance-doc-status"
              style={{
                background:
                  docStatus === 'published'
                    ? 'var(--theme-success-100, #d6f0e0)'
                    : 'var(--theme-elevation-100, #ececec)',
                borderRadius: 999,
                color:
                  docStatus === 'published'
                    ? 'var(--theme-success-700, #17603a)'
                    : 'var(--theme-elevation-700, #4a4a4a)',
                flexShrink: 0,
                // Pixel, bukan rem: root di sini 13px, jadi `0.7rem` terhitung
                // 9,1px — terlalu kecil untuk dibaca, dan bukan angka yang dipilih
                // siapa pun secara sadar.
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                lineHeight: 1,
                padding: '5px 9px',
                textTransform: 'uppercase',
              }}
              title={
                docStatus === 'published'
                  ? 'Versi terbit dari halaman ini sedang tayang'
                  : 'Halaman ini belum pernah diterbitkan'
              }
            >
              {docStatus === 'published' ? 'Terbit' : 'Draft'}
            </span>
          </div>

          <span style={{ fontSize: '0.8rem', opacity: 0.75 }}>
            {status === 'saving'
              ? 'Menyimpan…'
              : status === 'saved'
                ? savedAs === 'published'
                  ? 'Tersimpan dan diterbitkan.'
                  : 'Draft tersimpan.'
                : status === 'error'
                  ? `Gagal menyimpan: ${message}`
                  : 'Perubahan belum disimpan'}
          </span>

        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Puck
            config={config}
            data={data}
            height="100%"
            iframe={{ enabled: true, syncHostStyles: opts.syncHostStyles ?? false }}
            onChange={onChange}
            overrides={{ headerActions: headerActions as never, iframe: iframeOverride as never }}
          >
            {/*
              Dengan katalog menyala, layout BAWAAN Puck yang dipakai: rel ikon
              Blocks/Outline di kiri, toolbar peranti dan undo/redo di header.
              Menyusunnya sendiri berarti membangun ulang semua itu dari nol.
              Yang perlu dicegah hanya satu — tombol Publish milik Puck, karena
              menerbitkan adalah wewenang Payload — dan itu ditangani
              `overrides.headerActions`, bukan dengan membuang seluruh layout.

              Tanpa katalog tidak ada rel tab yang berguna (tinggal satu tab),
              jadi susunan tiga kolom yang lama tetap dipakai.
            */}
            {showComponentList ? null : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 260px) 1fr minmax(260px, 320px)',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    borderRight: '1px solid var(--theme-elevation-150, #e1e1e1)',
                    overflow: 'auto',
                  }}
                >
                  <Puck.Outline />
                </div>
                <Puck.Preview />
                <Puck.Fields />
              </div>
            )}
          </Puck>
        </div>
      </div>
    )
  }

  return PuckView
}
