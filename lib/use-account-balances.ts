'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useAccountBalances(enabled: boolean) {
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void createClient().rpc('account_balances').then(({ data, error }) => {
      if (!active) return
      if (!error) setBalances(Object.fromEntries((data ?? []).map((row) => [row.account_id, row.balance_satang])))
      setLoading(false)
    })
    return () => { active = false }
  }, [enabled])

  return { balances, loading }
}
