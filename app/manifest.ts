import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JodSa — บันทึกการเงิน',
    short_name: 'JodSa',
    description: 'บันทึกรายรับ-รายจ่าย อ่านสลิปธนาคารไทยบนอุปกรณ์ของคุณ',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#159E7B',
    orientation: 'portrait',
    icons: [
      { src: '/mascot/mascot-app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // Android Web Share Target: share a slip image from the gallery straight
    // into the app. Handled by the SW (app/sw.ts) → redirect to /import.
    // iOS has no share target — the in-app upload button is the iOS path.
    share_target: {
      action: '/import/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{ name: 'slip', accept: ['image/*'] }],
      },
    },
  }
}
