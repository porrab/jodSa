'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileImage, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { extractFields } from '@/lib/slip/extract'
import SlipConfirmForm from '@/components/slip-confirm-form'
import type { ParsedSlip, WorkerResponse } from '@/lib/slip/types'

interface Account {
  id: string
  name: string
  bank: string
}

interface Props {
  displayName: string | null
  accounts: Account[]
}

type Stage = 'idle' | 'processing' | 'confirming' | 'error'

const STAGE_LABELS: Record<string, string> = {
  preprocess: 'กำลังปรับภาพ...',
  qr: 'อ่าน QR...',
  ocr: 'อ่านข้อความ...',
  extract: 'ดึงข้อมูล...',
}

function toDatetimeLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

function nowBangkok(): string {
  // approximate Bangkok time (UTC+7) for default datetime
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  return now.toISOString().slice(0, 16)
}

export default function ImportClient({ displayName, accounts }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState({ label: '', percent: 0 })
  const [slip, setSlip] = useState<ParsedSlip | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('กรุณาเลือกไฟล์รูปภาพ')
        setStage('error')
        return
      }

      setStage('processing')
      setProgress({ label: 'กำลังเริ่มต้น...', percent: 2 })

      try {
        const arrayBuffer = await file.arrayBuffer()

        // Preprocess + QR decode in Web Worker
        const preprocessed = await new Promise<{
          buffer: ArrayBuffer
          width: number
          height: number
          qrData: string | null
        }>((resolve, reject) => {
          const worker = new Worker(
            new URL('../../workers/slip.worker.ts', import.meta.url),
            { type: 'module' },
          )
          worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const msg = e.data
            if (msg.type === 'progress') {
              setProgress({
                label: STAGE_LABELS[msg.stage] ?? msg.stage,
                percent: msg.percent,
              })
            } else if (msg.type === 'preprocessed') {
              worker.terminate()
              resolve({ buffer: msg.buffer, width: msg.width, height: msg.height, qrData: msg.qrData })
            } else if (msg.type === 'error') {
              worker.terminate()
              reject(new Error(msg.message))
            }
          }
          worker.onerror = (e) => {
            worker.terminate()
            reject(new Error(e.message))
          }
          worker.postMessage({ buffer: arrayBuffer, mimeType: file.type }, [arrayBuffer])
        })

        // OCR runs here on the main thread via tesseract.js, NOT inside slip.worker.ts.
        // tesseract.js v5 spawns its own internal WASM worker, so OCR is still async
        // and non-blocking. Moving it into the slip worker would create a nested worker
        // that breaks in Chrome/Safari. Privacy is preserved: only the preprocessed
        // ImageData (no original file bytes) is passed to tesseract.
        setProgress({ label: 'อ่านข้อความ...', percent: 40 })
        const { createWorker } = await import('tesseract.js')
        const tWorker = await createWorker(['tha', 'eng'], 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              setProgress({
                label: 'อ่านข้อความ...',
                percent: Math.round(40 + m.progress * 50),
              })
            }
          },
        })

        const pixelData = new Uint8ClampedArray(preprocessed.buffer)
        const imageData = new ImageData(pixelData, preprocessed.width, preprocessed.height)
        const { data: { text } } = await tWorker.recognize(imageData)
        await tWorker.terminate()

        setProgress({ label: 'ดึงข้อมูล...', percent: 95 })

        const parsed = extractFields(text, preprocessed.qrData, displayName)
        // Default datetime to now if OCR couldn't extract it
        if (!parsed.datetime.value) {
          parsed.datetime = { value: `${nowBangkok()}:00+07:00`, confidence: 0 }
        }

        setSlip(parsed)
        setStage('confirming')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        setStage('error')
      }
    },
    [displayName],
  )

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = '' // allow re-selecting same file
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  if (stage === 'confirming' && slip) {
    return (
      <SlipConfirmForm
        slip={slip}
        accounts={accounts}
        onBack={() => setStage('idle')}
        onSuccess={() => router.push('/transactions')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">นำเข้าสลิป</h1>
        <p className="text-sm text-muted-foreground">อ่านสลิปธนาคารไทยบนอุปกรณ์ของคุณ ไม่มีการอัปโหลดรูปภาพ</p>
      </div>

      {stage === 'idle' && (
        <label
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="rounded-full bg-muted p-4">
            <FileImage className="size-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">วางภาพสลิปที่นี่</p>
            <p className="text-sm text-muted-foreground">หรือแตะเพื่อเลือกไฟล์</p>
          </div>
          <input type="file" accept="image/*" className="sr-only" onChange={onFileInput} />
        </label>
      )}

      {stage === 'processing' && (
        <div className="flex flex-col items-center gap-4 rounded-xl border p-8">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <div className="w-full space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{progress.label}</span>
              <span className="text-muted-foreground">{progress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">รูปภาพไม่ถูกส่งออกนอกอุปกรณ์</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <p className="font-medium text-destructive">{errorMsg}</p>
          <Button variant="outline" onClick={() => setStage('idle')}>
            ลองอีกครั้ง
          </Button>
        </div>
      )}

      {stage === 'idle' && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Upload className="mt-0.5 size-3.5 shrink-0" />
          <span>รองรับสลิป SCB, KBank, KTB, BBL และ PromptPay — รูปภาพถูกประมวลผลบนอุปกรณ์และทิ้งทันทีหลังอ่าน</span>
        </div>
      )}
    </div>
  )
}
