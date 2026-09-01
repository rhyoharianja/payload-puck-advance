import { describe, expect, it } from 'vitest'

import { findBlocksField } from './findBlocksField.js'

/**
 * Fungsi ini kecil, tapi seluruh perbaikan bug `pegadaian-cms` ada di dalamnya —
 * dan mode gagalnya SENYAP: katalog kosong tanpa satu pun galat. Uji di sini
 * memakai bentuk susunan yang benar-benar ditemui di collection nyata.
 */
describe('findBlocksField', () => {
  const layout = { name: 'layout', type: 'blocks' as const }

  it('menemukan di tingkat teratas', () => {
    expect(findBlocksField([{ name: 'title', type: 'text' }, layout], 'layout')).toBe(layout)
  })

  it('menemukan di dalam tab — bentuk yang dulu gagal', () => {
    const fields = [
      { name: 'title', type: 'text' },
      {
        tabs: [
          { fields: [{ name: 'title', type: 'text' }], label: 'Umum' },
          { fields: [layout], label: 'Susunan' },
        ],
        type: 'tabs',
      },
    ]
    expect(findBlocksField(fields, 'layout')).toBe(layout)
  })

  it('menemukan di dalam group, array, collapsible, dan row', () => {
    for (const type of ['group', 'array', 'collapsible', 'row']) {
      expect(findBlocksField([{ fields: [layout], name: 'wadah', type }], 'layout')).toBe(layout)
    }
  })

  it('menemukan yang bersarang dalam-dalam', () => {
    const fields = [
      {
        tabs: [{ fields: [{ fields: [{ fields: [layout], type: 'row' }], name: 'g', type: 'group' }] }],
        type: 'tabs',
      },
    ]
    expect(findBlocksField(fields, 'layout')).toBe(layout)
  })

  it('TIDAK menelusuri ke dalam blocks', () => {
    /*
     * Sebuah block boleh punya field bernama sama di dalamnya. Mengembalikannya
     * berarti kanvas menyunting bagian dokumen yang keliru — kegagalan yang jauh
     * lebih sulit dikenali daripada katalog kosong, karena semuanya tampak jalan.
     */
    const didalam = { name: 'layout', type: 'blocks' as const }
    const fields = [
      {
        blocks: [{ fields: [didalam], slug: 'kolom' }],
        name: 'sections',
        type: 'blocks',
        // Payload menaruh field block di `blocks[].fields`; sebagian bentuk juga
        // membawa `fields` di tingkat field. Keduanya tidak boleh ditelusuri.
        fields: [didalam],
      },
    ]
    expect(findBlocksField(fields, 'layout')).toBeUndefined()
  })

  it('membedakan berdasarkan tipe, bukan hanya nama', () => {
    // Field bernama `layout` yang BUKAN blocks (mis. select) tidak boleh diterima:
    // dulu validasi boot mencari berdasarkan nama lalu memeriksa tipenya terpisah,
    // sehingga field semacam ini menghentikan pencarian di tempat yang salah.
    const fields = [{ name: 'layout', type: 'select' }, { fields: [layout], type: 'row' }]
    expect(findBlocksField(fields, 'layout')).toBe(layout)
  })

  it('aman terhadap undefined dan larik kosong', () => {
    expect(findBlocksField(undefined, 'layout')).toBeUndefined()
    expect(findBlocksField([], 'layout')).toBeUndefined()
    expect(findBlocksField([{ tabs: undefined, type: 'tabs' }], 'layout')).toBeUndefined()
  })
})
