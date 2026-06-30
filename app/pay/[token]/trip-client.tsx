'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, FileImage, Info, Plus, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { RequiredMark } from '@/components/ui/required-mark'
import { cn } from '@/lib/utils'
import { formatTHB, parseInputToSatang } from '@/lib/money'
import {
  computeTripLedger, perHead,
  type Participant as TripParticipant,
  type Expense as TripExpense,
  type Slip as TripSlip,
} from '@/lib/trip'
import { parseSlipImage, type ParseStage } from '@/lib/slip/parse-image'

type Ledger = {
  participants: TripParticipant[]
  expenses: TripExpense[]
  slips: TripSlip[]
  qrByExpense: Record<string, string | null>
}

type Stored = { participantId: string; participantToken: string; nickname: string }

const storeKey = (token: string) => `jodsa:trip:${token}`

function loadStored(token: string): Stored | null {
  try {
    const raw = localStorage.getItem(storeKey(token))
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

// ── Join ──────────────────────────────────────────────────────────────────────
function JoinForm({ token, onJoined }: { token: string; onJoined: (s: Stored) => void }) {
  const t = useTranslations('trip')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!nickname.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${token}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      if (!res.ok) {
        toast.error(t('joinFailed'))
        return
      }
      const data = (await res.json()) as { participantId: string; participantToken: string }
      const stored: Stored = {
        participantId: data.participantId,
        participantToken: data.participantToken,
        nickname: nickname.trim(),
      }
      localStorage.setItem(storeKey(token), JSON.stringify(stored))
      onJoined(stored)
    } catch {
      toast.error(t('joinFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="space-y-1 text-center">
        <Users className="mx-auto size-7 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t('joinTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('joinHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-nickname">{t('nickname')} <RequiredMark /></Label>
        <Input
          id="trip-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t('nicknamePlaceholder')}
          maxLength={40}
        />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy || !nickname.trim()}>
        {busy ? t('joining') : t('join')}
      </Button>
    </section>
  )
}

// ── Add expense ─────────────────────────────────────────────────────────────
function AddExpenseSheet({
  token, participantToken, defaultSplit, onDone, ownerAccounts, onOwnerAddExpense,
}: {
  token: string
  participantToken: string
  defaultSplit: number
  onDone: () => void
  // Owner mode (in-app): when present, submit goes through the authenticated
  // server action and the owner may reuse a saved account QR instead of uploading.
  ownerAccounts?: { id: string; label: string }[]
  onOwnerAddExpense?: (fd: FormData) => Promise<{ error: string }>
}) {
  const t = useTranslations('trip')
  const ownerMode = !!onOwnerAddExpense
  const savedAccounts = ownerAccounts ?? []
  const hasSaved = ownerMode && savedAccounts.length > 0

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [split, setSplit] = useState(String(defaultSplit))
  const [file, setFile] = useState<File | null>(null)
  // QR source (owner mode only): reuse a saved account QR vs upload a new image.
  const [qrSource, setQrSource] = useState<'saved' | 'upload'>(hasSaved ? 'saved' : 'upload')
  const [accountId, setAccountId] = useState(savedAccounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  function reset() {
    setTitle(''); setAmount(''); setSplit(String(defaultSplit)); setFile(null)
    setQrSource(hasSaved ? 'saved' : 'upload'); setAccountId(savedAccounts[0]?.id ?? '')
  }

  async function submit() {
    const satang = parseInputToSatang(amount)
    const splitN = Number(split)
    if (!title.trim()) { toast.error(t('expenseFailed')); return }
    if (satang === null || satang <= 0) { toast.error(t('expenseFailed')); return }
    if (!Number.isInteger(splitN) || splitN < 1) { toast.error(t('expenseFailed')); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('title', title.trim())
      fd.set('total_amount_satang', String(satang))
      fd.set('split_among', String(splitN))

      if (ownerMode) {
        if (qrSource === 'saved' && accountId) fd.set('qr_account_id', accountId)
        else if (file) fd.set('qr', file)
        const res = await onOwnerAddExpense!(fd)
        if (res.error) { toast.error(t('expenseFailed')); return }
      } else {
        fd.set('participant_token', participantToken)
        if (file) fd.set('qr', file)
        const res = await fetch(`/api/sessions/${token}/expenses`, { method: 'POST', body: fd })
        if (!res.ok) { toast.error(t('expenseFailed')); return }
      }

      toast.success(t('expenseAdded'))
      setOpen(false)
      reset()
      onDone()
    } catch {
      toast.error(t('expenseFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <SheetTrigger asChild>
        <Button size="sm"><Plus className="size-4 mr-1" />{t('addExpense')}</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[88vh] space-y-4 overflow-y-auto px-4 pb-8">
        <SheetHeader><SheetTitle>{t('addExpenseTitle')}</SheetTitle></SheetHeader>
        <div className="space-y-1.5">
          <Label htmlFor="exp-title">{t('expenseName')} <RequiredMark /></Label>
          <Input id="exp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('expenseNamePlaceholder')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">{t('total')} <RequiredMark /></Label>
            <Input id="exp-amount" type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-split">{t('splitAmong')} <RequiredMark /></Label>
            <Input id="exp-split" type="number" min={1} max={99} value={split} onChange={(e) => setSplit(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('qrLabel')}</Label>
          <p className="text-xs text-muted-foreground">{t('qrHint')}</p>

          {/* Owner with saved-QR accounts → choose between reusing one or uploading */}
          {hasSaved && (
            <div className="flex gap-2 pt-1">
              {(['saved', 'upload'] as const).map((src) => (
                <Button
                  key={src}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQrSource(src)}
                  className={cn('flex-1', qrSource === src && 'border-primary bg-primary/10 text-primary')}
                >
                  {src === 'saved' ? t('qrSourceSaved') : t('qrSourceUpload')}
                </Button>
              ))}
            </div>
          )}

          {hasSaved && qrSource === 'saved' ? (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder={t('qrSelectAccount')} /></SelectTrigger>
              <SelectContent>
                {savedAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <label className="mt-1 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50">
              <FileImage className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium">{file ? file.name : t('qrPick')}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
        <Button className="w-full" onClick={submit} disabled={busy}>
          {busy ? t('savingExpense') : t('saveExpense')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}

// ── Send slip toward an expense ───────────────────────────────────────────────
function SendSlipSheet({
  token, participantToken, expense, qrUrl, defaultAmountSatang, onDone,
}: {
  token: string
  participantToken: string
  expense: TripExpense
  qrUrl: string | null
  defaultAmountSatang: number
  onDone: () => void
}) {
  const t = useTranslations('trip')
  const ts = useTranslations('slip')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'upload' | 'manual'>('upload')
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState<{ stage: ParseStage | 'start'; percent: number }>({ stage: 'start', percent: 0 })
  const [amount, setAmount] = useState((defaultAmountSatang / 100).toFixed(2))
  const [paidAt, setPaidAt] = useState('')
  const [refCode, setRefCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setMode('upload'); setParsing(false); setProgress({ stage: 'start', percent: 0 })
    setAmount((defaultAmountSatang / 100).toFixed(2)); setPaidAt(''); setRefCode(null)
  }

  const processFile = useCallback(async (f: File) => {
    if (!f.type.startsWith('image/')) { toast.error(ts('pickImageFile')); return }
    setParsing(true)
    setProgress({ stage: 'start', percent: 2 })
    try {
      const parsed = await parseSlipImage(f, null, setProgress)
      if (parsed.amount.value !== null) setAmount((parsed.amount.value / 100).toFixed(2))
      if (parsed.datetime.value) setPaidAt(toDatetimeLocal(parsed.datetime.value))
      setRefCode(parsed.refCode.value)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ts('genericError'))
    } finally {
      setParsing(false)
    }
  }, [ts])

  async function submit() {
    const satang = parseInputToSatang(amount)
    if (satang === null || satang <= 0) { toast.error(t('slipFailed')); return }
    if (!paidAt) { toast.error(t('paidAt')); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/sessions/${token}/slips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_token: participantToken,
          expense_id: expense.id,
          amount_satang: satang,
          ref_code: mode === 'upload' ? refCode : null,
          paid_at: `${paidAt}:00+07:00`,
        }),
      })
      if (res.status === 409) { toast.error(t('slipDuplicate')); return }
      if (!res.ok) { toast.error(t('slipFailed')); return }
      toast.success(t('slipSent'))
      setOpen(false)
      reset()
      onDone()
    } catch {
      toast.error(t('slipFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">{t('payThis')}</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[88vh] space-y-4 overflow-y-auto px-4 pb-8">
        <SheetHeader><SheetTitle>{expense.title}</SheetTitle></SheetHeader>

        {qrUrl && (
          <div className="space-y-2 rounded-xl border p-4 text-center">
            <p className="text-sm font-medium">{t('scanToPay')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt={expense.title} className="mx-auto max-h-60 rounded-lg" />
          </div>
        )}

        <div className="flex gap-2">
          {(['upload', 'manual'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode(m)}
              className={cn('flex-1', mode === m && 'border-primary bg-primary/10 text-primary')}
            >
              {m === 'upload' ? t('readSlip') : t('typeAmount')}
            </Button>
          ))}
        </div>

        {mode === 'upload' && (
          parsing ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border p-6">
              <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="w-full space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{ts(`stage_${progress.stage}`)}</span><span>{progress.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50">
              <FileImage className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium">{ts('pickSlip')}</span>
              <input type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }} />
            </label>
          )
        )}

        <div className="space-y-1.5">
          <Label htmlFor="slip-amount">{t('amountLabel')} <RequiredMark /></Label>
          <Input id="slip-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slip-paid-at">{t('paidAt')} <RequiredMark /></Label>
          <Input id="slip-paid-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <Button className="w-full" onClick={submit} disabled={busy}>
          {busy ? t('sending') : t('send')}
        </Button>
      </SheetContent>
    </Sheet>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TripClient({
  token, title, ledger, seed = null, embedded = false,
  ownerAccounts, onOwnerAddExpense,
}: {
  token: string
  title: string
  ledger: Ledger
  // When the authenticated owner views their own trip in-app, we seed their
  // participant identity (token comes from the DB, not a join) so they skip the
  // join step and act through the same ledger UI + API routes.
  seed?: Stored | null
  embedded?: boolean
  // Owner-only: saved account QRs + the authenticated add-expense action. When
  // passed (in-app), AddExpenseSheet offers "use a saved QR" instead of upload.
  ownerAccounts?: { id: string; label: string }[]
  onOwnerAddExpense?: (fd: FormData) => Promise<{ error: string }>
}) {
  const t = useTranslations('trip')
  const router = useRouter()
  const [stored, setStored] = useState<Stored | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const existing = loadStored(token)
    const s = existing ?? seed
    if (!existing && seed) localStorage.setItem(storeKey(token), JSON.stringify(seed))
    setStored(s)
    setHydrated(true)
  }, [token, seed])

  const { participants, expenses, slips, qrByExpense } = ledger
  const nicknameOf = (id: string | null) =>
    participants.find((p) => p.id === id)?.nickname ?? '—'

  // "me" is resolved from the stored participant id against the live ledger.
  const me = stored ? participants.find((p) => p.id === stored.participantId) ?? null : null

  function refresh() {
    router.refresh()
  }

  async function toggleConfirm(slip: TripSlip, confirmed: boolean) {
    if (!stored) return
    try {
      const res = await fetch(`/api/sessions/${token}/slips/${slip.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_token: stored.participantToken, confirmed }),
      })
      if (!res.ok) { toast.error(t('slipFailed')); return }
      refresh()
    } catch {
      toast.error(t('slipFailed'))
    }
  }

  const summary = computeTripLedger(participants, expenses, slips)
  const mine = me ? summary.get(me.id) : undefined
  const remainingOwe = mine ? Math.max(0, mine.owes - mine.paid) : 0

  if (!hydrated) {
    return <main className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">…</main>
  }

  return (
    <main className={cn('space-y-5', embedded ? '' : 'mx-auto max-w-md p-4 pb-12')}>
      {!embedded && (
        <header className="space-y-1 pt-4 text-center">
          <p className="text-sm text-muted-foreground">{t('brand')}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-xs text-muted-foreground">{t('members', { count: participants.length })}</p>
        </header>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('trustNote')}</span>
      </div>

      {!me ? (
        <JoinForm token={token} onJoined={(s) => { setStored(s); refresh() }} />
      ) : (
        <>
          {/* Your summary */}
          <Card>
            <CardContent className="space-y-1 py-4">
              <p className="text-sm font-medium text-muted-foreground">{t('summaryHeading')}</p>
              {remainingOwe > 0 ? (
                <p className="text-lg font-semibold tabular-nums text-expense">
                  {t('summaryOwe', { amount: formatTHB(remainingOwe) })}
                </p>
              ) : (
                <p className="text-lg font-semibold text-income">{t('allSettled')}</p>
              )}
              {mine && mine.owedToThem > 0 && (
                <p className="text-sm tabular-nums text-muted-foreground">
                  {t('summaryOwed', { amount: formatTHB(mine.owedToThem) })}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Ledger header + add */}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('ledgerTitle')}</h2>
            <AddExpenseSheet
              token={token}
              participantToken={stored!.participantToken}
              defaultSplit={participants.length}
              onDone={refresh}
              ownerAccounts={ownerAccounts}
              onOwnerAddExpense={onOwnerAddExpense}
            />
          </div>

          {expenses.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('noExpenses')}
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((e) => {
                const isPayer = e.payer_participant_id === me.id
                const share = perHead(e)
                const expenseSlips = slips.filter((s) => s.expense_id === e.id)
                const iPaid = expenseSlips.some(
                  (s) => s.payer_participant_id === me.id && s.confirmed,
                )
                return (
                  <Card key={e.id}>
                    <CardContent className="space-y-3 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{e.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('paidBy', { name: isPayer ? t('you') : nicknameOf(e.payer_participant_id) })}
                            {' · '}{t('perHead', { amount: formatTHB(share) })}
                          </p>
                        </div>
                        <span className="shrink-0 tabular-nums font-semibold">{formatTHB(e.total_amount_satang)}</span>
                      </div>

                      {isPayer ? (
                        // Payer view: slips received + confirm toggles
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('slipsReceived', { count: expenseSlips.length })}
                          </p>
                          {expenseSlips.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('noSlipsYet')}</p>
                          ) : (
                            <div className="divide-y rounded-lg border">
                              {expenseSlips.map((s) => (
                                <div key={s.id} className="flex items-center gap-2 p-2.5">
                                  {s.confirmed
                                    ? <CheckCircle2 className="size-4 shrink-0 text-income" />
                                    : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm tabular-nums">{formatTHB(s.amount_satang)}</p>
                                    <p className="truncate text-xs text-muted-foreground">{nicknameOf(s.payer_participant_id)}</p>
                                  </div>
                                  <Switch
                                    checked={s.confirmed}
                                    onCheckedChange={(v) => toggleConfirm(s, v)}
                                    aria-label={t('confirmAria')}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : iPaid ? (
                        <Badge variant="outline" className="text-income">{t('settledWithYou')}</Badge>
                      ) : (
                        <>
                          <p className="text-sm tabular-nums text-expense">{t('youOwe', { amount: formatTHB(share) })}</p>
                          <SendSlipSheet
                            token={token}
                            participantToken={stored!.participantToken}
                            expense={e}
                            qrUrl={qrByExpense[e.id]}
                            defaultAmountSatang={share}
                            onDone={refresh}
                          />
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
