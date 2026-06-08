export interface FieldConfidence<T> {
  value: T | null
  confidence: number // 0–1
}

export interface ParsedSlip {
  amount: FieldConfidence<number>       // satang (integer)
  datetime: FieldConfidence<string>     // ISO 8601 with +07:00
  counterparty: FieldConfidence<string>
  refCode: FieldConfidence<string>      // from QR primarily
  bankCode: FieldConfidence<string>
  suggestedType: 'income' | 'expense'
  rawTextDebug?: string                 // dev-only, never persisted
}

export interface WorkerParseMessage {
  buffer: ArrayBuffer
  mimeType: string
}

export type WorkerResponse =
  | { type: 'progress'; stage: string; percent: number }
  | { type: 'preprocessed'; buffer: ArrayBuffer; width: number; height: number; qrData: string | null }
  | { type: 'error'; message: string }
