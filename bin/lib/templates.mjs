/**
 * Template file yang ditulis ke proyek.
 *
 * Aturan pembagiannya begini: SEMUA yang digenerate di sini adalah milik proyek —
 * definisi block, komponen render, route. Paket tidak membawa satu pun block atau
 * komponen, jadi tidak ada yang bisa "diperbarui dari dist" selain jembatannya
 * sendiri (`createPuckView`, hook revalidate). Karena itu hampir semua file di
 * bawah ditandai `preserve: true`: ini titik awal untuk diedit, bukan file
 * terkelola yang boleh ditimpa `init` berikutnya.
 */

import path from 'node:path'

/**
 * Impor ke file di `src` — pakai alias kalau proyek punya, kalau tidak hitung
 * path relatif dari lokasi file yang sedang ditulis.
 *
 * Proyek lama sering tidak punya alias sama sekali, dan menebak `@/` di sana
 * menghasilkan impor yang gagal saat build — bukan gagal saat scaffold, yang
 * jauh lebih membingungkan.
 */
const impFrom = (ctx, fromFile, target) => {
  if (ctx.alias) {
    return `${ctx.alias}/${target}`
  }
  const fromDir = path.posix.dirname(fromFile.split(path.sep).join('/'))
  const to = path.posix.join(ctx.srcRel === '' ? '.' : ctx.srcRel, target)
  let rel = path.posix.relative(fromDir, to)
  if (!rel.startsWith('.')) {
    rel = `./${rel}`
  }
  return rel
}

export const templates = (ctx) => {
  const files = []
  const port = ctx.frontendPort ?? '3000'

  // --- definisi block: Payload yang memiliki, form bawaan yang menambahkan ---

  files.push({
    contents: `import type { Block } from 'payload'

/**
 * Block Hero — definisi Payload biasa.
 *
 * Perhatikan tidak ada apa pun yang khusus Puck di sini. Itu intinya: Payload
 * memiliki definisi blok, form bawaan yang menambahkannya, dan panel field Puck
 * DITURUNKAN dari definisi ini saat runtime. Menambah field cukup di satu tempat.
 */
export const Hero: Block = {
  slug: 'hero',
  fields: [
    { name: 'eyebrow', type: 'text', label: 'Eyebrow' },
    { name: 'heading', type: 'text', label: 'Judul', required: true },
    { name: 'body', type: 'textarea', label: 'Deskripsi' },
    {
      name: 'tone',
      type: 'select',
      defaultValue: 'muted',
      label: 'Latar',
      options: [
        { label: 'Polos', value: 'default' },
        { label: 'Abu lembut', value: 'muted' },
      ],
    },
  ],
  labels: { plural: 'Hero', singular: 'Hero' },
}
`,
    note: 'block contoh — tambahkan block Anda sendiri di sebelahnya',
    path: `${ctx.srcRel}blocks/Hero.ts`,
    preserve: true,
  })

  files.push({
    contents: `import { Hero } from './Hero'

/** Block yang boleh berdiri di tingkat teratas halaman. */
export const layoutBlocks = [Hero]

export { Hero }
`,
    path: `${ctx.srcRel}blocks/index.ts`,
    preserve: true,
  })

  files.push({
    contents: `import type { ReactNode } from 'react'

/**
 * Komponen render untuk block milik aplikasi ini.
 *
 * Dipakai di DUA tempat dengan komponen yang sama persis: frontend produksi lewat
 * \`<BlockRenderer />\`, dan canvas Puck lewat \`renderMap\`. Itu yang membuat canvas
 * jujur — kalau canvas memakai komponen lain, ia menampilkan sesuatu yang tidak
 * pernah tayang.
 */

const cx = (...parts: (false | null | string | undefined)[]) => parts.filter(Boolean).join(' ')

const toneClass: Record<string, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted text-muted-foreground',
}

export const Hero = ({
  body,
  eyebrow,
  heading,
  tone = 'muted',
}: {
  body?: string
  eyebrow?: string
  heading?: string
  tone?: string
}) => (
  <section className={cx('px-4 py-24', toneClass[tone] ?? toneClass.muted)}>
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
      {eyebrow ? (
        <p className="text-xs font-medium tracking-widest uppercase opacity-70">{eyebrow}</p>
      ) : null}
      {heading ? (
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {heading}
        </h1>
      ) : null}
      {body ? <p className="max-w-prose text-lg opacity-80">{body}</p> : null}
    </div>
  </section>
)

export type BlockComponent = (props: Record<string, unknown>) => ReactNode

/**
 * Peta \`blockType\` → komponen. Kuncinya HARUS sama dengan \`slug\` block Payload;
 * di situlah frontend dan canvas bertemu.
 */
export const blockComponents: Record<string, BlockComponent> = {
  hero: Hero as BlockComponent,
}
`,
    note: 'komponen render — dipakai frontend DAN canvas Puck',
    path: `${ctx.srcRel}blocks/render.tsx`,
    preserve: true,
  })

  files.push({
    contents: `import type { ReactNode } from 'react'

import { blockComponents } from './render'

export type BlockRow = Record<string, unknown> & { blockType?: string; id?: string }

/**
 * Merender array blocks Payload apa adanya.
 *
 * Tidak ada normalisasi dan tidak ada bentuk perantara: yang dirender adalah baris
 * blocks yang sama dengan yang disimpan Payload. Itu yang membuat frontend dan
 * canvas Puck tidak bisa menyimpang.
 *
 * FAIL-SOFT: \`blockType\` tak dikenal dilewatkan, bukan dijadikan error. Admin dan
 * frontend adalah dua deploy terpisah, jadi frontend versi lama pasti akan menerima
 * blok baru pada suatu titik — dan meruntuhkan seluruh halaman karena satu blok
 * jauh lebih mahal daripada kehilangan satu blok.
 */
export const BlockRenderer = ({
  blocks,
  onUnknown,
}: {
  blocks: BlockRow[] | null | undefined
  onUnknown?: (blockType: string) => void
}): ReactNode => {
  const renderList = (rows: BlockRow[] | null | undefined, depth: number): ReactNode => {
    if (!Array.isArray(rows) || depth > 12) {
      return null
    }
    return rows.map((row, i) => {
      const slug = row.blockType
      const Component = slug ? blockComponents[slug] : undefined
      if (!Component || !slug) {
        if (slug) {
          onUnknown?.(slug)
        }
        return null
      }
      // \`renderSlot\` diteruskan sebagai prop supaya komponen block tidak perlu tahu
      // apakah isi slot-nya array (frontend) atau komponen (canvas Puck).
      return (
        <Component
          key={row.id != null ? String(row.id) : \`\${slug}-\${i}\`}
          {...row}
          renderSlot={(v: unknown) => renderList(v as BlockRow[], depth + 1)}
        />
      )
    })
  }

  return <>{renderList(blocks, 0)}</>
}
`,
    path: `${ctx.srcRel}blocks/BlockRenderer.tsx`,
    preserve: true,
  })

  // --- collection: plugin MENEMPEL pada ini, tidak membuatnya ---

  files.push({
    contents: `import type { CollectionConfig } from 'payload'

import { layoutBlocks } from '${impFrom(ctx, `${ctx.srcRel}collections/Pages.ts`, 'blocks')}'

/**
 * Collection halaman — MILIK APLIKASI, bukan dibuat plugin.
 *
 * Plugin Puck menempel pada collection ini; ia tidak mendefinisikan blok apa pun.
 * Yang menentukan blok yang tersedia adalah \`layoutBlocks\`.
 */
export const Pages: CollectionConfig = {
  slug: '${ctx.pagesSlug}',
  access: {
    // Draft hanya untuk yang terautentikasi. Jaring pengaman: kalau route publik
    // frontend salah mengirim \`draft=true\`, permintaannya ditolak di sini alih-alih
    // membocorkan konten belum terbit.
    read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
  },
  admin: {
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', label: 'Judul', required: true },
    {
      name: 'slug',
      type: 'text',
      admin: { description: 'Tanpa garis miring di depan. Gunakan \`home\` untuk halaman utama.' },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'layout',
      type: 'blocks',
      blocks: layoutBlocks,
      // \`labels.singular\` menentukan bunyi tombolnya: Payload merender
      // "Add <singular>".
      labels: { plural: 'Layout', singular: 'Layout' },
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', label: 'Judul SEO' },
        { name: 'description', type: 'textarea', label: 'Deskripsi' },
      ],
      label: 'SEO',
    },
  ],
  labels: { plural: 'Halaman', singular: 'Halaman' },
  // Puck menyimpan ke draft. Tanpa ini setiap simpan langsung tayang.
  versions: { drafts: true, maxPerDoc: 20 },
}
`,
    note: 'collection halaman — plugin menempel padanya',
    path: `${ctx.srcRel}collections/Pages.ts`,
    preserve: true,
  })

  // --- jembatan ke plugin ---

  files.push({
    contents: `'use client'

import { createPuckView } from 'payload-puck-advance/client'

import { blockComponents } from '${impFrom(ctx, `${ctx.srcRel}components/PuckView.tsx`, 'blocks/render')}'

/**
 * View Puck untuk aplikasi ini.
 *
 * File ini tetap perlu ada meski tipis: importMap Payload butuh path statis, dan
 * \`renderMap\` harus datang dari aplikasi — paket tidak boleh punya komponen
 * sendiri, karena canvas akan menampilkan sesuatu yang tidak pernah tayang.
 */
export const PuckView = createPuckView({ renderMap: blockComponents })

export default PuckView
`,
    path: `${ctx.srcRel}components/PuckView.tsx`,
  })

  // --- data + route frontend ---

  files.push({
    contents: `import type { BlockRow } from '${impFrom(ctx, `${ctx.srcRel}lib/cms.ts`, 'blocks/BlockRenderer')}'

export type PageDoc = {
  layout?: BlockRow[]
  seo?: { description?: string; title?: string }
  slug: string
  title: string
}

/**
 * Klien data ke Payload — REST API bawaan, tanpa endpoint khusus.
 *
 * Tidak ada lapisan normalisasi: yang diambil adalah dokumen apa adanya, dan
 * \`layout\`-nya array blocks yang langsung bisa dirender. Endpoint perantara hanya
 * akan menjadi bentuk ketiga yang harus dijaga sinkron dengan dua lainnya.
 *
 * Memakai HTTP, bukan Local API — begitu frontend dipindah ke service sendiri,
 * file ini tidak perlu berubah sama sekali.
 */
const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL ?? 'http://localhost:${port}'

const query = (slug: string, draft: boolean) =>
  \`\${CMS_URL}/api/${ctx.pagesSlug}?where[slug][equals]=\${encodeURIComponent(slug)}&limit=1&depth=2\${
    draft ? '&draft=true' : ''
  }\`

type NextInit = RequestInit & { next?: { revalidate?: number; tags?: string[] } }

/**
 * Halaman terbit. SENGAJA tanpa parameter draft.
 *
 * Satu fungsi dengan flag \`isDraft\` cepat atau lambat akan dipanggil dari route
 * publik dengan flag menyala. Memisahkannya secara fisik membuat kebocoran itu
 * mustahil, bukan sekadar tidak disarankan.
 */
export const getPublishedPage = async (slug: string): Promise<null | PageDoc> => {
  const init: NextInit = {
    // Tag per halaman supaya publish hanya memurge yang berubah.
    next: { revalidate: 3600, tags: [\`${ctx.pagesSlug}:\${slug}\`] },
  }
  const res = await fetch(query(slug, false), init)
  if (!res.ok) {
    return null
  }
  const json = (await res.json()) as { docs?: PageDoc[] }
  return json.docs?.[0] ?? null
}

/** Halaman draft. Hanya dipanggil dari route /preview. */
export const getDraftPage = async (slug: string, cookie: string): Promise<null | PageDoc> => {
  const res = await fetch(query(slug, true), {
    // Draft tidak boleh masuk cache mana pun.
    cache: 'no-store',
    headers: { cookie },
  })
  if (!res.ok) {
    return null
  }
  const json = (await res.json()) as { docs?: PageDoc[] }
  return json.docs?.[0] ?? null
}
`,
    path: `${ctx.srcRel}lib/cms.ts`,
    preserve: true,
  })

  const g = ctx.routeGroup ? `${ctx.routeGroup}/` : ''
  const appRel = `${ctx.appDir}/`
  // Path stylesheet dihitung PER FILE, bukan satu nilai untuk semua.
  // `page.tsx` ada di root route group, dua lainnya satu level lebih dalam —
  // memakai nilai yang sama membuat `./styles.css` menunjuk ke folder route,
  // dan Next gagal resolve dengan pesan yang tidak menyebut penyebabnya.
  const css = (depth) => (ctx.stylesFile ? `${'../'.repeat(depth) || './'}${ctx.stylesFile}` : null)

  files.push({
    contents: `import { notFound } from 'next/navigation'

import { BlockRenderer } from '${impFrom(ctx, `${appRel}${g}page.tsx`, 'blocks/BlockRenderer')}'
import { getPublishedPage } from '${impFrom(ctx, `${appRel}${g}page.tsx`, 'lib/cms')}'
${css(0) ? `\nimport '${css(0)}'\n` : ''}
/**
 * Halaman utama — slug \`home\`. Dipisah dari catch-all karena Next tidak
 * mengizinkan \`page.tsx\` dan \`[[...slug]]\` hidup bersama di level yang sama.
 */
export default async function HomePage() {
  const page = await getPublishedPage('home')

  if (!page) {
    notFound()
  }

  return (
    <main>
      <BlockRenderer blocks={page.layout} />
    </main>
  )
}
`,
    note: 'halaman utama (slug `home`)',
    path: `${appRel}${g}page.tsx`,
    preserve: true,
  })

  files.push({
    contents: `import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { BlockRenderer } from '${impFrom(ctx, `${appRel}${g}[...slug]/page.tsx`, 'blocks/BlockRenderer')}'
import { getPublishedPage } from '${impFrom(ctx, `${appRel}${g}[...slug]/page.tsx`, 'lib/cms')}'
${css(1) ? `\nimport '${css(1)}'\n` : ''}
type Params = { params: Promise<{ slug: string[] }> }

export const generateMetadata = async ({ params }: Params): Promise<Metadata> => {
  const { slug } = await params
  const page = await getPublishedPage(slug.join('/'))
  return { description: page?.seo?.description, title: page?.seo?.title ?? page?.title }
}

export default async function CmsPage({ params }: Params) {
  const { slug } = await params
  const page = await getPublishedPage(slug.join('/'))

  if (!page) {
    notFound()
  }

  return (
    <main>
      <BlockRenderer
        blocks={page.layout}
        onUnknown={(t) => console.warn(\`[blocks] blockType tidak dikenal: \${t}\`)}
      />
    </main>
  )
}
`,
    path: `${appRel}${g}[...slug]/page.tsx`,
    preserve: true,
  })

  files.push({
    contents: `'use client'

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

/**
 * Live Preview varian SERVER-SIDE: menyegar saat dokumen disimpan, bukan saat
 * mengetik.
 *
 * Varian client-side mendorong form state lewat postMessage setiap ketikan. Untuk
 * frontend di service terpisah itu membuang bandwidth, dan hasilnya tidak melewati
 * pipeline render sebenarnya sehingga justru kurang akurat.
 */
export const RefreshOnSave = () => {
  const router = useRouter()
  return (
    <RefreshRouteOnSave
      refresh={() => router.refresh()}
      serverURL={process.env.NEXT_PUBLIC_CMS_URL ?? 'http://localhost:${port}'}
    />
  )
}
`,
    path: `${appRel}${g}preview/RefreshOnSave.tsx`,
  })

  files.push({
    contents: `import { headers } from 'next/headers'

import { BlockRenderer } from '${impFrom(ctx, `${appRel}${g}preview/page.tsx`, 'blocks/BlockRenderer')}'
import { getDraftPage } from '${impFrom(ctx, `${appRel}${g}preview/page.tsx`, 'lib/cms')}'
${css(1) ? `\nimport '${css(1)}'\n` : ''}
import { RefreshOnSave } from './RefreshOnSave'

/**
 * Route preview — dimuat di dalam iframe Live Preview panel admin.
 *
 * Bedanya dari route publik hanya dua: membaca DRAFT, dan tidak pernah di-cache
 * maupun diindeks. Sisanya melewati komponen block yang sama persis.
 */

// \`dynamic\` harus LITERAL: Next membacanya secara statis saat build, jadi nilai
// dari variabel tidak dikenali dan route ini boleh di-cache — artinya draft bisa
// tersaji dari cache.
export const dynamic = 'force-dynamic'

export const metadata = { robots: { follow: false, index: false } }

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug = 'home' } = await searchParams
  const cookie = (await headers()).get('cookie') ?? ''
  const page = await getDraftPage(slug, cookie)

  if (!page) {
    return (
      <main className="p-10">
        <p>
          Draft tidak bisa dibaca. Pastikan Anda login di panel admin pada domain yang sama —
          membaca draft memang butuh autentikasi.
        </p>
      </main>
    )
  }

  return (
    <main>
      <RefreshOnSave />
      <BlockRenderer blocks={page.layout} />
    </main>
  )
}
`,
    path: `${appRel}${g}preview/page.tsx`,
    preserve: true,
  })

  files.push({
    contents: `import { createRevalidateRoute } from 'payload-puck-advance/next'

/** Dipanggil hook \`afterChange\` Payload saat halaman dipublish. */
export const POST = createRevalidateRoute({ secret: process.env.REVALIDATE_SECRET })
`,
    path: `${appRel}api/puck-revalidate/route.ts`,
  })

  return files
}

/**
 * Stylesheet untuk proyek yang belum punya.
 *
 * Token di sini MILIK APLIKASI. Paket tidak lagi membawa `tokens.css` maupun class
 * Tailwind apa pun, dan itu menghilangkan satu jebakan: Tailwind v4 tidak memindai
 * `node_modules`, jadi class yang tinggal di paket akan hilang dari stylesheet
 * ter-compile tanpa satu pun pesan error. Karena seluruh class sekarang ada di
 * `src`, `@source` tidak dibutuhkan.
 */
export const STYLES_CONTENTS = `@import 'tailwindcss';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
}

:root {
  --background: #ffffff;
  --foreground: #12201e;
  --muted: #f1f5f4;
  --muted-foreground: #38443f;
  --primary: #0e6a5f;
  --primary-foreground: #ffffff;
}

/*
 * Dua-duanya perlu: [data-theme] untuk pilihan eksplisit, dan
 * prefers-color-scheme untuk pembaca yang memakai setelan sistem — mayoritas
 * pembaca berada di keadaan kedua.
 */
[data-theme='dark'] {
  --background: #0d1312;
  --foreground: #e7edeb;
  --muted: #1a2321;
  --muted-foreground: #c3cecb;
  --primary: #52c2b1;
  --primary-foreground: #0d1312;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --background: #0d1312;
    --foreground: #e7edeb;
    --muted: #1a2321;
    --muted-foreground: #c3cecb;
    --primary: #52c2b1;
    --primary-foreground: #0d1312;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
`

export const ENV_KEYS = [
  [
    'NEXT_PUBLIC_CMS_URL',
    'http://localhost:3000',
    'URL Payload dari sisi frontend. Beda domain? Isi URL absolutnya.',
  ],
  [
    'FRONTEND_URL',
    'http://localhost:3000',
    'URL frontend yang dipanggil hook publish untuk purge cache.',
  ],
  [
    'REVALIDATE_SECRET',
    '',
    'Shared secret endpoint revalidate. Tanpa ini revalidate DIMATIKAN (gagal tertutup).',
  ],
]

export const configSnippet = (ctx) => `    payloadPuckAdvance({
      // Plugin MENEMPEL pada collection yang sudah ada — ia tidak membuat
      // collection dan tidak mendefinisikan block. Setiap slug di sini wajib punya
      // field \`blocks\`; kalau tidak, plugin gagal saat boot, bukan diam-diam.
      collections: ['${ctx.pagesSlug}'],
      puckViewComponent: '${ctx.alias ?? '.'}/components/PuckView#PuckView',
      revalidate: process.env.REVALIDATE_SECRET
        ? {
            secret: process.env.REVALIDATE_SECRET,
            url: \`\${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/api/puck-revalidate\`,
          }
        : false,
    }),`

export const livePreviewSnippet = (ctx) => `    // Preview memuat frontend SUNGGUHAN dalam mode draft, bukan tiruan di admin.
    livePreview: {
      collections: ['${ctx.pagesSlug}'],
      url: ({ data }) =>
        \`\${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/preview?slug=\${
          (data as { slug?: string })?.slug ?? 'home'
        }\`,
    },`
