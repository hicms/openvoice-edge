import { History, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { HistoryItem } from './history'

interface HistorySheetProps {
  items: HistoryItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestore: (item: HistoryItem) => void
  onClear: () => void
  engineName: (model: string) => string
}

export function HistorySheet({ items, open, onOpenChange, onRestore, onClear, engineName }: HistorySheetProps) {
  const { t, i18n } = useTranslation()
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History /> {t('speak.history.open')}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('speak.history.title')}</SheetTitle>
          <SheetDescription>{t('speak.history.empty')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4">
          <ul className="flex flex-col gap-2 pb-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{engineName(item.model)}</Badge>
                  <span>{format.format(item.createdAt)}</span>
                </div>
                <p className="mb-2 line-clamp-3 text-sm break-words">{item.text}</p>
                <Button size="sm" variant="outline" onClick={() => onRestore(item)}>
                  {t('speak.history.restore')}
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
        {items.length > 0 && (
          <SheetFooter>
            <Button variant="destructive" onClick={onClear}>
              <Trash2 /> {t('speak.history.clear')}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
