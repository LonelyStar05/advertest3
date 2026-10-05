import { Check } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

import type { LifecycleStage, LifecycleTone } from './lifecycle'

const CURRENT_RING: Record<LifecycleTone, string> = {
  normal: 'border-navy bg-surface-solid text-foreground ring-4 ring-violet/15',
  success: 'border-approved bg-approved text-white ring-4 ring-approved/15',
  warning: 'border-threshold bg-surface-solid text-threshold ring-4 ring-threshold/20',
  danger: 'border-fail bg-surface-solid text-fail ring-4 ring-fail/15',
}

/**
 * Thanh vòng đời gọn dưới đầu trang chi tiết experiment: bước đã qua có dấu ✓, bước hiện tại nổi
 * bật kèm một câu ngắn; bước có nội dung bấm được (kết quả, review, report).
 */
export function LifecycleStepper({ stages }: { stages: LifecycleStage[] }) {
  return (
    <nav aria-label="Vòng đời experiment" className="panel overflow-x-auto px-3 py-2">
      <ol className="flex min-w-[50rem] items-center gap-1" data-testid="vong-doi">
        {stages.map((stage, i) => {
          const done = stage.state === 'done'
          const current = stage.state === 'current'
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[12.5px] font-semibold tabular-nums',
                  done && 'border-navy bg-navy text-primary-foreground',
                  current && CURRENT_RING[stage.tone],
                  !done && !current && 'border-line text-muted-foreground',
                )}
              >
                {done || (current && stage.tone === 'success') ? (
                  <Check className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span
                  className={cn(
                    'text-[13.5px] whitespace-nowrap',
                    current ? 'font-semibold' : done ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {stage.label}
                </span>
                {stage.note && (
                  <span className="text-[12px] whitespace-nowrap text-muted-foreground">
                    {stage.note}
                  </span>
                )}
              </span>
              <span className="sr-only">
                {done ? ' (đã xong)' : current ? ' (bước hiện tại)' : ' (chưa tới)'}
              </span>
            </>
          )
          const cls =
            'flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1.5 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 items-center gap-1">
              {stage.to ? (
                <Link
                  to={stage.to}
                  replace={stage.to.startsWith('?')}
                  aria-current={current ? 'step' : undefined}
                  className={cn(cls, 'hover:bg-muted')}
                >
                  {body}
                </Link>
              ) : (
                <span aria-current={current ? 'step' : undefined} className={cls}>
                  {body}
                </span>
              )}
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-0.5 min-w-3 flex-1 rounded-full',
                    done ? 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed]' : 'bg-line',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
