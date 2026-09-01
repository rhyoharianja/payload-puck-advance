/**
 * Mencari field `blocks` bernama tertentu di dalam susunan field Payload.
 *
 * Dibuat karena pencarian datar (`fields.find(...)`) gagal begitu field-nya berada
 * di dalam tab — susunan yang lumrah di collection nyata, dan dipakai
 * `pegadaian-cms`.
 *
 * Kegagalannya muncul di DUA tempat dengan gejala yang sangat berbeda:
 *
 * 1. Validasi saat boot melempar "tidak punya field blocks bernama …" — mengganggu,
 *    tapi jujur: ia menunjuk masalahnya.
 * 2. Katalog block di canvas hanya mendapat `undefined` dan menampilkan NOL block —
 *    tanpa satu pun galat di konsol. Ini yang berbahaya: plugin tampak berhasil
 *    boot, canvas terbuka, dan editor menyimpulkan tidak ada block yang terdaftar.
 *
 * Karena itu keduanya sekarang memakai fungsi yang SAMA. Memperbaiki satu saja
 * menghasilkan keadaan yang lebih buruk daripada bug aslinya: boot lolos, katalog
 * diam-diam kosong.
 *
 * Bentuk field sengaja diterima secara struktural, bukan lewat tipe `Field` Payload:
 * pemanggil di sisi server memegang config asli, sementara yang di client memegang
 * config terserialisasi yang bentuknya lebih longgar.
 */

type AnyField = {
  fields?: AnyField[]
  name?: string
  tabs?: { fields?: AnyField[] }[]
  type?: string
}

export const findBlocksField = (
  fields: readonly AnyField[] | undefined,
  name: string,
): AnyField | undefined => {
  for (const field of fields ?? []) {
    if (field?.name === name && field.type === 'blocks') {
      return field
    }

    /*
     * JANGAN menelusuri ke dalam `blocks`.
     *
     * Sebuah field blocks membawa `blocks[].fields` miliknya sendiri, dan di
     * dalamnya sangat mungkin ada field bernama sama — `layout` di dalam sebuah
     * block bukan hal aneh. Menelusuri ke sana akan mengembalikan field yang salah,
     * dan hasilnya kanvas menyunting bagian dokumen yang keliru: kegagalan yang
     * jauh lebih sulit dikenali daripada katalog kosong.
     *
     * `tabs` perlu perlakuan tersendiri karena anaknya berada satu tingkat lebih
     * dalam (`tabs[].fields`), bukan di `fields`. Sisanya — `group`, `array`,
     * `collapsible`, `row` — semuanya memakai `fields`.
     */
    if (field?.type === 'blocks') {
      continue
    }

    const children =
      field?.type === 'tabs'
        ? (field.tabs ?? []).flatMap((tab) => tab?.fields ?? [])
        : (field?.fields ?? [])

    const found = findBlocksField(children, name)
    if (found) {
      return found
    }
  }

  return undefined
}
