import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-1111-1111-111111111111' } } }) },
    rpc: mocks.rpc,
    from: () => ({ insert: mocks.insert }),
  }),
}))

import { addAssetTransaction } from '@/app/actions/invest/transactions'

function fundedBuy(): FormData {
  const data = new FormData()
  data.set('holding_id', '22222222-2222-2222-2222-222222222222')
  data.set('type', 'buy')
  data.set('qty', '2')
  data.set('amount', '10.00')
  data.set('currency', 'THB')
  data.set('fees', '0')
  data.set('datetime', '2026-10-28T12:00')
  data.set('cash_enabled', 'true')
  data.set('cash_account_id', '33333333-3333-3333-3333-333333333333')
  data.set('cash_amount', '20.00')
  return data
}

describe('funded buy action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses one atomic RPC and never writes either row separately', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null })
    expect(await addAssetTransaction({ error: '' }, fundedBuy())).toEqual({ error: '' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('record_buy_with_cash', expect.objectContaining({
      p_holding_id: '22222222-2222-2222-2222-222222222222',
      p_account_id: '33333333-3333-3333-3333-333333333333',
      p_amount_satang: 2000,
    }))
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('reports an RPC failure without falling back to a one-sided insert', async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'cash insert failed' } })
    expect(await addAssetTransaction({ error: '' }, fundedBuy())).toEqual({ error: 'cash insert failed' })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
