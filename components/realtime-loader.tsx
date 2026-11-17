'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
const RealtimeSync = dynamic(() => import('./realtime-sync'), { ssr: false })
export default function RealtimeLoader() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated ? <RealtimeSync /> : null
}
