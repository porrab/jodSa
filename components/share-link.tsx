'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy, ExternalLink, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Shows the FULL absolute share URL (origin is client-only, hence the effect) +
// Copy / Open / native Share. Used by both the collect session detail and the
// trip management view.
export default function ShareLink({ path, title }: { path: string; title: string }) {
  const t = useTranslations('session')
  const [url, setUrl] = useState(path)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`)
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [path])

  async function copy() {
    await navigator.clipboard.writeText(url)
    toast.success(t('linkCopied'))
  }

  async function share() {
    try {
      await navigator.share({ title, url })
    } catch {
      /* user cancelled the share sheet */
    }
  }

  return (
    <div className="space-y-3">
      <code className="block truncate rounded bg-muted px-2 py-1.5 text-xs">{url}</code>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 className="size-3.5 mr-1.5" />{t('share')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="size-3.5 mr-1.5" />{t('copy')}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={path} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5 mr-1.5" />{t('openView')}
          </a>
        </Button>
      </div>
    </div>
  )
}
