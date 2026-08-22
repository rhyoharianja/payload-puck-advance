# payload-puck-advance

Canvas Puck untuk Payload CMS — sebagai **jembatan**, bukan sebagai design system.

Payload yang memiliki definisi blok. Form bawaan Payload yang dipakai menambah dan
menyusun blok. Puck **hanya merender** dan memberi panel field yang diturunkan dari
definisi blok itu, saat runtime.

Paket ini tidak membawa satu pun block, komponen, token, atau CSS.

```ts
payloadPuckAdvance({
  collections: ['pages'],
  puckViewComponent: '@/components/PuckView#PuckView',
})
```

## Kenapa bentuknya begini

Versi pertama paket ini membawa "contract" sendiri: taksonomi lima lapis, katalog
section bawaan, token CSS, dan lapisan normalisasi antara Payload dan frontend.
Semuanya dibuang, karena tiga alasan yang muncul begitu dipakai sungguhan:

1. **Dua sumber kebenaran.** Menambah satu field berarti mengubah contract, block
   Payload, dan komponen render — tiga tempat yang harus tetap sinkron secara
   manual. Yang ketinggalan tidak error, hanya diam-diam hilang.
2. **Katalog yang bukan milik proyek.** Canvas menawarkan section yang tidak pernah
   ada di form bawaan, jadi editor bisa menyusun halaman yang tidak bisa disunting
   di tempat lain.
3. **Bentuk ketiga.** Lapisan normalisasi menjadi bentuk data ketiga di samping
   dokumen Payload dan props komponen — dan bentuk ketiga inilah yang selalu
   ketinggalan versi.

Sekarang: satu sumber kebenaran (definisi block Payload), satu bentuk data (baris
`blocks` apa adanya), satu himpunan komponen (dipakai frontend **dan** canvas).

## Cara kerjanya

```
src/blocks/Hero.ts          definisi block Payload      ← SATU-SATUNYA sumber kebenaran
      │
      ├──→ form bawaan Payload         (menambah & menyusun blok)
      ├──→ panel field Puck            (diturunkan saat runtime oleh paket ini)
      └──→ src/blocks/render.tsx       (komponen React)
                 │
                 ├──→ frontend produksi   lewat <BlockRenderer />
                 └──→ canvas Puck         lewat renderMap
```

Yang dikerjakan paket ini, dan hanya ini:

- membaca definisi block dari client config Payload (`useConfig()`), lalu
  menurunkan `config.components` Puck darinya
- memetakan baris `blocks` ↔ data Puck, dua arah
- memasang view dokumen full-viewport di `/admin/collections/<slug>/<id>/puck`
- mengganti ikon mata Live Preview dengan dropdown tiga mode
- memuat & menyimpan lewat REST API Payload, hormat pada draft/versions
- opsional: hook revalidate saat publish

Katalog Puck **sengaja kosong** (`Puck.Components` tidak dirender). Blok ditambah
di form bawaan; canvas untuk menata dan menyunting isinya.

## Pemasangan

```bash
pnpm add payload-puck-advance
npx payload-puck-advance init --dry-run   # lihat rencananya dulu
npx payload-puck-advance init
pnpm generate:importmap
```

`init` menulis file yang **milik proyek Anda** — definisi block contoh, komponen
render, collection `Pages`, klien data, dan route frontend — lalu menambal
`payload.config.ts`. Semua file itu ditandai aman: `init` berikutnya tidak akan
menimpanya tanpa `--force`.

Manual? Yang minimal dibutuhkan:

1. Collection dengan field `blocks` (default bernama `layout`) dan
   `versions: { drafts: true }`.
2. `src/blocks/render.tsx` — peta `blockType` → komponen React.
3. `src/components/PuckView.tsx`:

   ```tsx
   'use client'
   import { createPuckView } from 'payload-puck-advance/client'
   import { blockComponents } from '@/blocks/render'

   export const PuckView = createPuckView({ renderMap: blockComponents })
   ```

4. Plugin di `payload.config.ts` seperti contoh di paling atas.

## Opsi

| Opsi                   | Wajib | Default                                            | Keterangan                                                          |
| ---------------------- | ----- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `collections`          | ✔     | —                                                  | Slug collection yang ditempeli. Wajib sudah ada di config.          |
| `puckViewComponent`    | ✔     | —                                                  | Path komponen view Puck milik aplikasi.                             |
| `field`                |       | `'layout'`                                         | Nama field `blocks` yang disunting.                                 |
| `previewModeComponent` |       | `'payload-puck-advance/client#PreviewModeSelect'`  | Dropdown mode; ganti kalau ingin UI sendiri.                        |
| `puckViewPath`         |       | `'/puck'`                                          | Path view dokumen.                                                  |
| `revalidate`           |       | `false`                                            | `{ secret, url, headers? }` — dipanggil saat publish.               |
| `disabled`             |       | `false`                                            | Lewati seluruh plugin (untuk feature flag).                         |

Plugin **gagal saat boot** kalau `collections` kosong, kalau slug-nya tidak ada di
config, atau kalau collection itu tidak punya field `blocks` bernama `field`.
Itu disengaja: kegagalan diam-diam di sini muncul jauh kemudian sebagai canvas
kosong tanpa sebab yang jelas.

Opsi `createPuckView`: `renderMap` (wajib), `fieldName`, `fullScreen`,
`stylesheetFrom`, `syncHostStyles`, `iframeOverride`.

## Tipe field yang didukung

Diturunkan otomatis ke field Puck:

`text` · `textarea` · `number` · `select` · `radio` · `checkbox` · `array` ·
`group` · `blocks` (jadi slot) · `row`/`collapsible`/`tabs` (diratakan)

**Sengaja tidak** ditawarkan di Puck: `richText`, `upload`, `relationship`, `join`,
`date`, `point`, `code`, `json`, `ui`.

`richText` yang paling penting di daftar itu. Isinya Lexical JSON; menyuguhkannya
sebagai textarea berarti editor bisa menimpanya dengan teks biasa dan datanya rusak
tanpa peringatan. Field seperti ini tetap disunting di form bawaan — Puck hanya
tidak menawarkannya, dan nilainya tidak tersentuh saat menyimpan dari canvas.

`checkbox` menjadi radio dua nilai, karena Puck tidak punya field boolean.

## Tiga mode penyunting — tanpa field baru

Ikon mata Live Preview diganti dropdown berisi tiga pilihan:

| Pilihan          | Perilaku                               |
| ---------------- | -------------------------------------- |
| **Form**         | form bawaan Payload (default)          |
| **Live Preview** | Live Preview Payload, apa adanya       |
| **Puck**         | membuka view Puck di **tab baru**      |

### Kenapa bukan slot `PreviewButton`

`PreviewButton` hanya dirender kalau `admin.preview` dikonfigurasi — sedangkan ikon
mata itu `button.live-preview-toggler`, yang tidak punya slot pengganti sama sekali.
Jadi dropdown dipasang lewat `beforeDocumentControls`, ditambah satu aturan CSS yang
menyembunyikan toggler aslinya. Satu baris CSS, bukan fork komponen admin.

### Kenapa Puck di tab baru

Konteks berbeda, bukan sekadar tampilan berbeda: canvas punya state seleksi,
undo/redo, dan simpan sendiri. Menumpuknya di atas form berarti dua form bersarang
(`Puck.Fields` selalu merender `<form>`, dan seluruh layout dokumen Payload sudah
berada di dalam `<form>`) — hydration error, bukan sekadar HTML tidak sah.

Setelah tab dibuka, nilai dropdown **tidak** ikut berpindah ke `puck`. Tab lama
masih menampilkan form; menandainya "Puck" akan berbohong soal apa yang terlihat.

### Penuh viewport, bukan sisa ruang di bawah shell admin

Payload tidak mengizinkan `views.edit.root` hidup bersama custom view. Jadi view
Puck dirender sebagai lapisan `position: fixed` seukuran viewport, dengan scroll
body dikunci selama aktif. Hasilnya sama seperti mengambil alih halaman — tanpa
mengorbankan custom view.

### Header view Puck

Tombol kembali (ke halaman dokumen), status dokumen, pemilih status
(`#puck-advance-status`), dan tombol simpan (`#puck-advance-save`).

Simpan memakai `PATCH ...?draft=true`. Dengan `_status: 'draft'` tulisannya hanya
masuk tabel versions; dengan `_status: 'published'` dokumen benar-benar terbit —
`draft=true` di URL tidak menghalanginya.

`id` pada elemen-elemen itu ada demi test: label tombol berubah mengikuti status
dokumen, jadi selector berbasis teks membuat suite ikut bergantung pada state.

### CSS canvas: dipinjam dari frontend, bukan disalin

Iframe canvas Puck kosong, dan `syncHostStyles` mengambil CSS **admin** — bukan CSS
frontend. Akibatnya canvas menampilkan teks polos sementara Live Preview tampil
bergaya.

Solusinya: saat canvas dibuka, halaman frontend (`stylesheetFrom`, default `/`)
diambil, tag stylesheet-nya dibaca, lalu disuntikkan ke iframe lewat
`overrides.iframe`. Bukan disalin ke dalam paket — jadi begitu frontend mengubah
tema, canvas ikut berubah tanpa rebuild apa pun.

## Menulis block

Definisi Payload biasa, tanpa apa pun yang khusus Puck:

```ts
export const Hero: Block = {
  slug: 'hero',
  fields: [{ name: 'heading', type: 'text', label: 'Judul', required: true }],
  labels: { plural: 'Hero', singular: 'Hero' },
}
```

Komponennya dipakai di dua konteks dengan komponen yang **sama persis**:

```tsx
export const blockComponents = { hero: Hero as BlockComponent }
```

Kunci peta harus sama dengan `slug` block. Di situlah frontend dan canvas bertemu;
kalau canvas memakai komponen lain, ia menampilkan sesuatu yang tidak pernah tayang.

### Slot (blok di dalam blok)

Field `blocks` di dalam block menjadi slot Puck. Komponennya menerima dua prop:
isi slot (array di frontend, komponen di canvas) dan `renderSlot`:

```tsx
export const Grid = ({ items, renderSlot }: { items?: unknown; renderSlot?: (v: unknown) => ReactNode }) => (
  <div className="grid gap-6 md:grid-cols-2">{renderSlot ? renderSlot(items) : null}</div>
)
```

**Jangan** buat slot yang mengizinkan block ber-slot lain, termasuk dirinya sendiri.
`blockReferences` tidak memutus rekursi: "Kolom di dalam Kolom" tidak punya base
case dan definisinya meledak jadi `Maximum call stack size exceeded` saat boot.
Konsekuensinya satu tingkat nesting — batas yang dipilih sadar, bukan bug.

### Aturan emas: tanpa margin luar

Komponen block mengatur padding dalamnya sendiri, tidak pernah margin luarnya.
Spacing antar-blok adalah keputusan halaman, bukan keputusan blok — begitu satu blok
membawa `mt-*`, urutannya tidak lagi bisa ditukar bebas.

## Catatan yang menghemat waktu

**Tailwind v4 tidak memindai `node_modules`.** Selama paket ini masih membawa
komponen sendiri, class-nya hilang dari stylesheet ter-compile tanpa satu pun error —
gejalanya halaman tanpa gaya meski class-nya benar ada di HTML. Sekarang seluruh
class ada di `src` proyek, jadi `@source` tidak dibutuhkan lagi. Kalau Anda menaruh
komponen block di paket sendiri, jebakan itu kembali.

**Batas 63 karakter untuk identifier Postgres.** Blok bersarang membuat nama enum
seperti `enum_layout_pages_v_blocks_..._new_tab` melewati batas dan push schema
gagal. Perpendek nama field, atau set `dbName`/`enumName` eksplisit.

**`export const dynamic` harus literal.** Next membacanya secara statis; `dynamic =
route.dynamic` diabaikan tanpa peringatan, dan route preview jadi boleh di-cache —
artinya draft bisa tersaji dari cache.

**Jangan `build` paket saat dev server hidup.** Payload sedang membaca `dist/`; hasil
paling ringannya modul hilang di tengah request. `build` juga menjalankan `clean`
lebih dulu, karena `swc` tidak memangkas file dari sumber yang sudah dihapus — tanpa
itu, kode lama tetap tinggal di `dist` dan tampak seperti perubahan yang tidak jalan.

## CLI: `payload-puck-advance init`

Dideteksi otomatis: package manager, `src/`, direktori App Router, route group,
alias impor dari `tsconfig.json`, lokasi `payload.config.ts`, dan apakah slug
`pages` sudah dipakai (kalau ya, dipakai `puck-pages`).

Yang dijamin: `--dry-run` tidak menulis apa pun; tidak pernah menimpa tanpa
`--force` (dan `--force` membuat `.bak`); bisa dijalankan ulang; dan lebih memilih
melaporkan langkah manual daripada menebak.

Patching config dilakukan dengan pencarian teks, **bukan** rewriting AST. AST
terlihat lebih pintar, tapi config Payload di proyek nyata sangat bervariasi —
dibungkus fungsi, di-spread dari file lain, plugin hasil `.map()` — dan di situ AST
gagal secara halus. Pencarian teks gagal secara terbuka: kalau tidak yakin, ia
menolak menyentuh file dan mencetak potongan untuk ditempel.

Patcher menyisipkan tiga hal: impor plugin, `Pages` ke array `collections` (wajib —
plugin melempar error kalau slug-nya tidak terdaftar), dan `livePreview` ke `admin`.
Taruh komentar `// @puck-advance:plugins` di dalam array `plugins` untuk menentukan
titik sisipnya sendiri.

Tanpa alias impor, path komponen di config di-resolve relatif terhadap
`admin.importMap.baseDir` — nilai yang tidak bisa ditebak dari luar. CLI
melaporkannya sebagai peringatan alih-alih menebak.

## Uji runtime

Suite e2e di `payload-boilerplate/tests/e2e/puck.e2e.spec.ts` (19 test) menjaga
justru hal-hal yang pernah rusak: katalog Puck harus **kosong**, outline hanya berisi
isi halaman, panel field benar-benar diturunkan dari definisi block Payload, lapisan
penuh viewport, CSS canvas terpasang, tidak ada form bersarang, tidak ada overlay
error Next, tombol kembali dan pemilih status ada, serta draft vs publish menulis ke
tempat yang benar.
