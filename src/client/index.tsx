'use client'

import { createPreviewModeSelect } from './createPreviewModeSelect.js'

/**
 * Pemilih mode SIAP PAKAI, dirujuk langsung dari config paket ini.
 *
 * Hanya ini yang bisa siap pakai. `PuckView` tidak, dan itu memang benar: view-nya
 * perlu `renderMap` — pemetaan slug block ke komponen React milik APLIKASI — dan
 * paket ini tidak boleh menebaknya.
 */
export const PreviewModeSelect = createPreviewModeSelect()
