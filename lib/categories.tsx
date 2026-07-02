import { useTranslations } from 'next-intl'
import { CATEGORIES } from '@/lib/validators/transaction'

const KNOWN = new Set<string>(CATEGORIES)

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
  return <>{KNOWN.has(value) ? t(value) : value}</>
}
