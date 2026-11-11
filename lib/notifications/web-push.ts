import 'server-only'
import * as webpush from 'web-push'

export function configureWebPush() {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
}

export function pushFailure(error: unknown, sensitive: string[] = []) {
  const value = typeof error === 'object' && error ? error : {}
  const statusCode = 'statusCode' in value && Number.isFinite(Number(value.statusCode)) ? Number(value.statusCode) : null
  let body = 'body' in value && typeof value.body === 'string' && value.body ? value.body
    : 'message' in value && typeof value.message === 'string' ? value.message : ''
  for (const text of [...sensitive, process.env.VAPID_PRIVATE_KEY, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.CRON_SECRET]) {
    if (text) body = body.split(text).join('[redacted]')
  }
  body = body.replace(/https?:\/\/[^\s"<>]+/g, '[redacted-url]')
  return { statusCode, body: body.slice(0, 200) }
}
