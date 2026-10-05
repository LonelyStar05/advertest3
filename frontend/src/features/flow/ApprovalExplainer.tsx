import { BadgeCheck, CircleHelp, Pencil, XOctagon } from 'lucide-react'

import type { ModelVerdict, ReviewDecision } from '@/contracts/api'
import { MODEL_VERDICT_LABEL } from '@/features/experiments/review-labels'
import { cn } from '@/lib/utils'

import { DECISION_MEANING, MODEL_VERDICT_MEANING } from './approval'

const LOOK: Record<ReviewDecision, { icon: typeof BadgeCheck; tile: string }> = {
  approve: { icon: BadgeCheck, tile: '[--tile-bg:#dcfce7] [--tile-fg:#15803d]' },
  changes_requested: { icon: Pencil, tile: '[--tile-bg:#fef3c7] [--tile-fg:#b45309]' },
  reject: { icon: XOctagon, tile: '[--tile-bg:#ffe4e6] [--tile-fg:#be123c]' },
}

/**
 * "Duyệt nghĩa là gì?": ba cột Chấp nhận / Yêu cầu sửa / Từ chối, mỗi cột nói quyết định đó nghĩa
 * là gì và điều gì xảy ra tiếp. Thu gọn mặc định; `decided` làm nổi cột đã áp dụng.
 */
export function ApprovalExplainer({
  decided = null,
  defaultOpen = false,
  className,
}: {
  decided?: ReviewDecision | null
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details
      open={defaultOpen}
      className={cn('group rounded-xl border border-line bg-surface-solid', className)}
      data-testid="giai-thich-duyet"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden className="size-4 text-muted-foreground" />
        Duyệt nghĩa là gì?
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
          Xem ba quyết định
        </span>
      </summary>
      <div className="grid gap-2 border-t border-line p-3 md:grid-cols-3">
        {DECISION_MEANING.map((m) => {
          const { icon: Icon, tile } = LOOK[m.decision]
          const here = decided === m.decision
          return (
            <section
              key={m.decision}
              aria-label={m.title}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg p-3 text-[13px] leading-5',
                here ? 'bg-muted shadow-[0_0_0_1.5px_var(--navy)]' : 'bg-muted/50',
              )}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn('tile size-7', tile)} aria-hidden>
                  <Icon className="size-3.5" />
                </span>
                {m.title}
                {here && (
                  <span className="ml-auto rounded-full bg-navy px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Quyết định này
                  </span>
                )}
              </p>
              <p>{m.means}</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Tiếp theo: </span>
                {m.next}
              </p>
              {m.caveat && (
                <p className="rounded-md border-l-2 border-threshold bg-threshold/10 px-2 py-1 font-medium">
                  {m.caveat}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </details>
  )
}

/** Giải thích ba lựa chọn "Kết luận về model", đặt cạnh ô chọn. */
export function ModelVerdictHelp({ selected }: { selected?: ModelVerdict | '' }) {
  return (
    <ul
      className="space-y-1 text-xs leading-5 text-muted-foreground"
      data-testid="giai-thich-ket-luan-model"
    >
      {(Object.keys(MODEL_VERDICT_MEANING) as ModelVerdict[]).map((v) => (
        <li key={v} className={cn(selected === v && 'text-foreground')}>
          <span className="font-semibold text-foreground">{MODEL_VERDICT_LABEL[v]}:</span>{' '}
          {MODEL_VERDICT_MEANING[v]}
        </li>
      ))}
    </ul>
  )
}
