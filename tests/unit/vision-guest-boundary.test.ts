import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it.each(['pay-client.tsx','trip-client.tsx'])('guest %s never opts into Vision', file => {
  const source = readFileSync(`app/pay/[token]/${file}`, 'utf8')
  expect(source).toContain('parseSlipImage(')
  expect(source).not.toMatch(/ocr:\s*['"]vision['"]|recognizeWithVision|vision-preferences/)
})
