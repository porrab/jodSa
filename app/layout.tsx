import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Thai_Looped } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import Providers from '@/components/providers'
import './globals.css'

/**
 * Looped, not the plain cut (design v4 F5). Plex is IBM's corporate face —
 * precise but cool — and JodSa is personal money for general Thai users. The
 * looped Thai glyphs read warmer and more native while staying in the SAME
 * family, so x-height, metrics and line-height carry over and a shipped app
 * does not need re-typesetting. Weights 400–700 exist on both cuts, so this is
 * a like-for-like swap.
 */
const ibmPlexSansThai = IBM_Plex_Sans_Thai_Looped({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'JodSa',
  description: 'บันทึกการเงินส่วนตัว — อ่านสลิปธนาคารไทยบนอุปกรณ์ของคุณ',
  manifest: '/manifest.webmanifest',  
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'JodSa' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5fdf8' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1b2c' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    <html lang={locale} suppressHydrationWarning className={ibmPlexSansThai.variable}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NextIntlClientProvider messages={messages}>
            <Providers>
              {children}
            </Providers>
          </NextIntlClientProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
