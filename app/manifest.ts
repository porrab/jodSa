import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JodSa — บันทึกการเงิน',
    short_name: 'JodSa',
    description: 'บันทึกรายรับ-รายจ่าย อ่านสลิปธนาคารไทยบนอุปกรณ์ของคุณ',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // M5: share_target for Android Web Share API
  }
}
