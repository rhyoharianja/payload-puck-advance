/**
 * Adapter Next.js: factory untuk route publik, route preview, endpoint
 * revalidate, dan klien data.
 *
 * Dipisah dari entry utama karena mengimpor `next/cache` dan `next/navigation`.
 * Konsumen non-Next memakai `/react` dan REST API langsung.
 */
export * from '../next/index.js'
