'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SlipQueue from '@/components/slip-queue'
import { takeSharedSlip } from '@/lib/share-target'
import type { LastAccountMap } from '@/lib/last-account'

interface Account { id: string; name: string; bank: string; number_hint: string | null }

interface Props {
  displayName: string | null
  accounts: Account[]
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
}

/** Shared full-page host for desktop drop/drop and Android Share Target. */
export default function ImportClient({ displayName, accounts, lastByCategory, globalLastAccountId }: Props) {
  const router = useRouter()
  const [sharedFiles, setSharedFiles] = useState<File[]>([])

  useEffect(() => {
    let active = true
    void takeSharedSlip().then((file) => {
      if (active && file) setSharedFiles([file])
    })
    return () => { active = false }
  }, [])

  return (
    <SlipQueue
      key={sharedFiles.map((file) => `${file.name}-${file.lastModified}`).join('|') || 'picker'}
      initialFiles={sharedFiles}
      displayName={displayName}
      accounts={accounts}
      lastByCategory={lastByCategory}
      globalLastAccountId={globalLastAccountId}
      onSingleSaved={() => router.push('/transactions')}
    />
  )
}
