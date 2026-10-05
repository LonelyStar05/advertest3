import { Gauge, Layers, Rocket } from 'lucide-react'

import { cn } from '@/lib/utils'

import { EXPERIMENT_TEMPLATES, type ExperimentTemplate } from './quick'

const LOOK: Record<ExperimentTemplate['id'], { icon: typeof Rocket; tile: string }> = {
  fast: { icon: Rocket, tile: '[--tile-bg:#fce7f3] [--tile-fg:#be185d]' },
  probe: { icon: Gauge, tile: '[--tile-bg:#e0f2fe] [--tile-fg:#0369a1]' },
  full: { icon: Layers, tile: '[--tile-bg:#f5f3ff] [--tile-fg:#6d28d9]' },
}

/** Hàng thẻ "Mẫu experiment" ở bước 1: bấm một thẻ điền sẵn mọi bước. */
export function QuickTemplates({
  busy,
  onPick,
}: {
  /** Mẫu đang được áp (chờ tải dữ liệu). */
  busy: ExperimentTemplate['id'] | null
  onPick: (template: ExperimentTemplate) => void
}) {
  return (
    <section className="space-y-2" aria-labelledby="mau-experiment" data-testid="mau-experiment">
      <h3 id="mau-experiment" className="font-semibold">
        Mẫu experiment
      </h3>
      <p className="text-sm text-muted-foreground">
        Bấm một mẫu để điền sẵn mọi bước bằng lựa chọn hợp lý; bạn vẫn sửa được từng bước. Hoặc tự
        chọn protocol ngay bên dưới.
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {EXPERIMENT_TEMPLATES.map((t) => {
          const { icon: Icon, tile } = LOOK[t.id]
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy !== null}
              onClick={() => onPick(t)}
              className={cn(
                'lift flex min-h-11 flex-col items-start gap-1.5 rounded-xl border border-line bg-surface-solid p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60',
                busy === t.id && 'border-navy shadow-[0_0_0_1px_var(--navy)]',
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className={cn('tile size-8', tile)} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="font-semibold">{busy === t.id ? 'Đang điền sẵn…' : t.title}</span>
              </span>
              <span className="text-sm leading-5 text-muted-foreground">{t.description}</span>
              <ul className="space-y-0.5 text-[13px] leading-5">
                {t.checks.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                    {c}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
    </section>
  )
}
