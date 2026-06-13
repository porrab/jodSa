import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import Providers from '@/components/providers'
import './globals.css'

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
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
