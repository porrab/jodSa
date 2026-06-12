import { z } from 'zod'

export const groupSchema = z.object({
  title: z.string().trim().min(1, 'กรุณาใส่ชื่อกลุ่ม').max(100),
  note: z.string().trim().max(500).optional(),
})

export type GroupInput = z.infer<typeof groupSchema>
