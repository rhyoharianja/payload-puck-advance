'use client'

import { useDocumentInfo, useLivePreviewContext } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'

export type PreviewModeSelectOptions = {
  /** Slug collection, untuk menyusun URL view. Default: dari `useDocumentInfo`. */
  collectionSlug?: string
  /**
   * Menyembunyikan tombol toggle Live Preview bawaan Payload. Default `true`.
   *
   * Dropdown ini sudah memegang perannya, jadi membiarkan keduanya tampil berarti
   * dua kontrol untuk satu hal — dan keduanya bisa saling bertentangan di mata
   * pengguna.
   */
  hideNativeToggler?: boolean
  /** Path view Puck relatif terhadap dokumen. Default `/puck`. */
  puckPath?: string
}

type Mode = 'form' | 'live-preview' | 'puck'

/**
 * Mengganti ikon mata Live Preview dengan pemilih mode, di kontrol dokumen.
 *
 * Didaftarkan lewat `admin.components.edit.beforeDocumentControls`, dan
 * menyembunyikan toggler bawaannya. Tidak ada field baru di form — halaman edit
 * tetap persis tampilan bawaan Payload; yang berubah hanya satu ikon menjadi satu
 * dropdown, di tempat yang sama.
 *
 * Kenapa bukan slot `PreviewButton`: slot itu untuk tombol `admin.preview`, dan ia
 * TIDAK dirender kalau `admin.preview` tidak dikonfigurasi. Ikon mata yang terlihat
 * saat `admin.livePreview` aktif adalah `button.live-preview-toggler` — komponen
 * lain, tanpa slot pengganti. Sudah dicoba lewat `PreviewButton` lebih dulu, dan
 * hasilnya tidak pernah muncul.
 *
 * Versi sebelumnya menaruhnya sebagai UI field `layout` di badan form. Itu salah
 * tempat: memilih cara menyunting adalah aksi terhadap DOKUMEN, sederajat dengan
 * Save dan Publish — bukan nilai yang disimpan bersama konten. Di badan form ia
 * terbaca sebagai field yang bisa diisi.
 *
 * Karena ia menggantikan tombol Preview, dropdown ini yang sekarang memegang
 * seluruh peran itu:
 *
 * - `form`         — tidak melakukan apa-apa. Kondisi default; halaman edit apa
 *                    adanya.
 * - `live-preview` — menyalakan Live Preview Payload lewat `setIsLivePreviewing`.
 *                    Bukan reimplementasi: itu API publik `@payloadcms/ui`, dan
 *                    Payload sendiri yang menyimpan kondisinya sebagai preferensi
 *                    `editViewType`.
 * - `puck`         — membuka view Puck di TAB BARU, dan pilihannya TIDAK berpindah
 *                    ke "Puck" karena Puck bukan mode halaman ini.
 */
export const createPreviewModeSelect = (opts: PreviewModeSelectOptions = {}) => {
  const PreviewModeSelect = () => {
    const { id, collectionSlug } = useDocumentInfo()
    const { isLivePreviewEnabled, isLivePreviewing, setIsLivePreviewing } = useLivePreviewContext()



    const slug = opts.collectionSlug ?? collectionSlug

    const puckHref = useMemo(
      () => (id ? `/admin/collections/${slug}/${id}${opts.puckPath ?? '/puck'}` : null),
      [id, slug],
    )

    const mode: Mode = isLivePreviewing ? 'live-preview' : 'form'

    const onChange = useCallback(
      (next: Mode) => {
        if (next === 'puck') {
          if (puckHref) {
            window.open(puckHref, '_blank', 'noopener')
          }
          return
        }
        setIsLivePreviewing(next === 'live-preview')
      },
      [puckHref, setIsLivePreviewing],
    )

    // Dokumen baru belum punya id, jadi belum ada yang bisa disusun di Puck.
    // Menampilkan pilihan yang pasti gagal lebih buruk daripada menyembunyikannya.
    if (!id) {
      return null
    }

    return (
      <div style={{ alignItems: 'center', display: 'flex' }}>
        {/*
          Toggler bawaan disembunyikan lewat CSS karena Payload tidak menyediakan
          slot penggantinya. Selektornya adalah nama class INTERNAL Payload, jadi
          ia bisa berubah tanpa peringatan — karena itu ada assertion e2e yang
          memastikan ikon mata benar-benar tersembunyi DAN dropdown ini muncul.
          Kalau class-nya berganti, test gagal dengan keras alih-alih menampilkan
          dua kontrol untuk satu hal.
        */}
        {opts.hideNativeToggler === false ? null : (
          <style>{'.live-preview-toggler{display:none !important}'}</style>
        )}
        {/* Label hanya untuk pembaca layar: ia menggantikan sebuah tombol ikon,
            jadi jejak visualnya harus sepadan — teks label di sebelahnya akan
            mendorong Save Draft dan Publish. */}
        <label className="sr-only" htmlFor="puck-advance-edit-mode">
          Mode penyunting
        </label>
        <select
          aria-label="Mode penyunting"
          id="puck-advance-edit-mode"
          onChange={(e) => onChange(e.target.value as Mode)}
          style={{
            background: 'var(--theme-input-bg, transparent)',
            border: '1px solid var(--theme-elevation-150, #d0d0d0)',
            borderRadius: '4px',
            color: 'inherit',
            fontSize: '0.8rem',
            height: '2.25rem',
            padding: '0 0.5rem',
          }}
          value={mode}
        >
          <option value="form">Form bawaan</option>
          {/* Hanya ditawarkan kalau `admin.livePreview` memang dikonfigurasi —
              menawarkan mode yang tidak akan terjadi lebih buruk daripada tidak
              menawarkannya. */}
          {isLivePreviewEnabled ? <option value="live-preview">Live Preview</option> : null}
          {/* Ditawarkan di kedua mode: view Puck membaca dan menulis bentuk
              penyimpanan yang berlaku, jadi ia tidak lagi bisa menimpa susunan
              yang dibuat dari form. */}
          <option value="puck">Puck (buka tab baru)</option>
        </select>
      </div>
    )
  }

  return PreviewModeSelect
}
