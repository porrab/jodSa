import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import SessionsClient from './sessions-client'

export default async function SessionsPage() {
  const t = await getTranslations('session')
  const supabase = await createClient()

  const [{ data: sessions }, { data: slips }, { data: accounts }] = await Promise.all([
    supabase.from('payment_sessions').select('*').order('created_at', { ascending: false }),
    supabase.from('session_slips').select('session_id, amount_satang, confirmed'),
    supabase.from('accounts').select('id, name, bank, qr_image_path').order('created_at'),
  ])

  const totals = new Map<string, { recorded: number; confirmed: number; count: number }>()
  for (const s of slips ?? []) {
    const t = totals.get(s.session_id) ?? { recorded: 0, confirmed: 0, count: 0 }
    t.recorded += s.amount_satang
    if (s.confirmed) t.confirmed += s.amount_satang
    t.count += 1
    totals.set(s.session_id, t)
  }

  const items = (sessions ?? []).map((s) => ({
    ...s,
    ...(totals.get(s.id) ?? { recorded: 0, confirmed: 0, count: 0 }),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <SessionsClient sessions={items} accounts={accounts ?? []} />
    </div>
  )
}
