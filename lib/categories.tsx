import { useTranslations } from 'next-intl'
import { Scale } from 'lucide-react'
import { CATEGORIES, SYSTEM_CATEGORIES } from '@/lib/validators/transaction'

const KNOWN = new Set<string>([...CATEGORIES, ...SYSTEM_CATEGORIES])

/**
 * Renders a stored category key ('food', 'transport', …) as its localized label.
 * Categories are persisted as stable English keys, so this is a display-only layer
 * — no data migration. Unknown/legacy values fall back to the raw string; null → nothing.
 *
 * Works as a plain-text node, so it can be a <SelectItem> child (Radix reads its
 * text content for the trigger + typeahead) or sit inline in a <span>.
 */
export function CategoryLabel({ value }: { value?: string | null }) {
  const t = useTranslations('categories')
  if (!value) return null
  if (value === 'adjustment') return <span className="inline-flex items-center gap-1"><Scale aria-hidden="true" className="size-3.5" />{t(value)}</span>
  return <>{KNOWN.has(value) ? t(value) : value}</>
}
