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

    const save = useCallback(async () => {
      setStatus('saving')
      setMessage(null)
      try {
        const res = await fetch(`/api/${collection}/${id}?draft=true`, {
          /*
           * `_status` dikirim bersama datanya, dan `draft=true` dipakai untuk KEDUA
           * status. Payload memprioritaskan `_status` yang eksplisit, jadi
           * `published` menerbitkan meski permintaannya draft — satu jalur simpan,
           * satu field yang membedakan.
           */
          body: JSON.stringify({
            [field]: puckDataToBlocks(latest.current as PuckData, blocks),
            _status: docStatus,
          }),
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        setStatus('saved')
      } catch (err) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : String(err))
      }
    }, [blocks, collection, docStatus, id])

    // Ctrl/Cmd+S menyimpan. Tanpa ini, refleks pertama editor justru memicu dialog
    // simpan halaman milik browser.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          void save()
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
     * `children` sengaja tidak dirender: isinya tombol Publish bawaan Puck, yang
     * menulis lewat `onPublish` dan melewati draft, versi, serta access control
     * Payload.
     */
    const headerActions = useCallback(
      () => (
        <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
          <label className="sr-only" htmlFor="puck-advance-status">
            Status dokumen
          </label>
          <select
            id="puck-advance-status"
            onChange={(e) => setDocStatus(e.target.value as 'draft' | 'published')}
            style={{
              background: 'var(--theme-input-bg, transparent)',
              border: '1px solid var(--theme-elevation-150, #d0d0d0)',
              borderRadius: '4px',
              color: 'inherit',
              fontSize: '0.8rem',
              height: '2.25rem',
              padding: '0 0.5rem',
            }}
            value={docStatus}
          >
            <option value="draft">Simpan sebagai draft</option>
            <option value="published">Terbitkan</option>
          </select>

          <button
            className="btn btn--style-primary"
            disabled={status === 'saving'}
            // Id stabil supaya otomasi tidak bergantung pada LABEL, yang memang
            // berubah mengikuti status dokumen.
            id="puck-advance-save"
            onClick={() => void save()}
            style={{ margin: 0 }}
            type="button"
          >
            {docStatus === 'published' ? 'Terbitkan' : 'Simpan draft'}
          </button>
        </div>
      ),
      [docStatus, save, status],
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
          </div>

          <span style={{ fontSize: '0.8rem', opacity: 0.75 }}>
            {status === 'saving'
              ? 'Menyimpan…'
              : status === 'saved'
                ? docStatus === 'published'
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
