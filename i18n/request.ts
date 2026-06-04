import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async () => {
  // M1: default Thai. M5: read from user profile / cookie.
  const locale = 'th'
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
