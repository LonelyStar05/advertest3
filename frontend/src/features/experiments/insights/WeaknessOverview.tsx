import { Grid3x3, Lightbulb, OctagonX, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import type { ExperimentDetail, RunView } from '@/contracts/api'

import {
  type AttackSummary,
  attackSummaries,
  casesHref,
  formatDrop,
  type HeatCell,
  type HeatGroup,
  heatmapGroups,
  HEAT_STOPS,
  heatStop,
  levelText,
  quickInsights,
  type Severity,
  SEVERITY_LABEL,
  SEVERITY_RANGE,
} from './insights'

const SEVERITY_STYLE: Record<Severity, { icon: typeof ShieldCheck; text: string; tile: string }> = {
  ok: {
    icon: ShieldCheck,
    text: 'text-approved',
    tile: '[--tile-bg:#dcfce7] [--tile-fg:#15803d]',
  },
  warn: {
    icon: TriangleAlert,
    text: 'text-threshold',
    tile: '[--tile-bg:#fef3c7] [--tile-fg:#b45309]',
  },
  severe: {
    icon: OctagonX,
    text: 'text-fail',
    tile: '[--tile-bg:#fee2e2] [--tile-fg:#b91c1c]',
  },
}

const LINK =
  'inline-flex min-h-11 items-center rounded-md font-medium text-detect-strong underline underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

/** Nhãn mức nghiêm trọng: màu + icon + chữ. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: Icon, text } = SEVERITY_STYLE[severity]
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${text}`}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

// ---------------------------------------------------------------- Kết luận nhanh

function QuickInsights({ experiment, runs }: { experiment: ExperimentDetail; runs: RunView[] }) {
  const sentences = quickInsights(experiment, runs)
  return (
    <section aria-labelledby="ket-luan-nhanh" className="panel flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className="tile size-9 [--tile-bg:#e0f2fe] [--tile-fg:#0369a1]">
          <Lightbulb aria-hidden="true" className="size-5" />
        </span>
        <h3 id="ket-luan-nhanh" className="text-base font-semibold">
          Kết luận nhanh
        </h3>
      </div>
      {sentences.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có run nào có số liệu. Kết luận sẽ hiện khi run đầu tiên chạy xong.
        </p>
      ) : (
        <ul className="grid gap-x-6 gap-y-2 lg:grid-cols-2">
          {sentences.map((s) => {
            const { icon: Icon, text } = SEVERITY_STYLE[s.tone]
            return (
              <li
                key={s.id}
                className="flex flex-col gap-x-3 rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6 sm:flex-row sm:items-center"
              >
                <span className="flex min-w-0 flex-1 gap-2">
                  <Icon aria-hidden="true" className={`mt-1 size-4 shrink-0 ${text}`} />
                  <span className="min-w-0">{s.text}</span>
                </span>
                {s.href && (
                  <Link
                    to={s.href}
                    aria-label={s.linkLabel ?? undefined}
                    className={`${LINK} shrink-0 self-start pl-6 text-sm sm:self-auto sm:pl-0`}
                  >
                    Xem ảnh hỏng
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Thẻ theo attack

function SeverityCard({ summary }: { summary: AttackSummary }) {
  const style = summary.severity ? SEVERITY_STYLE[summary.severity] : null
  const Icon = style?.icon
  return (
    <li className="panel flex min-w-0 flex-col gap-2 p-4" aria-label={summary.label}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-semibold" title={summary.name}>
            {summary.label}
          </h4>
          {summary.severity ? (
            <SeverityBadge severity={summary.severity} />
          ) : (
            <span className="text-sm text-muted-foreground">Chưa có số liệu</span>
          )}
        </div>
        {style && Icon && (
          <span className={`tile size-9 ${style.tile}`}>
            <Icon aria-hidden="true" className="size-5" />
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="whitespace-nowrap text-muted-foreground">Sụt mạnh nhất</dt>
        <dd className="text-right font-semibold tabular-nums">
          {summary.worst ? (
            <>
              {formatDrop(summary.worst.drop)}
              <span className="font-normal text-muted-foreground">
                {' '}
                ở {levelText(summary.worst.level, summary.paramName, summary.paramUnit)}
              </span>
            </>
          ) : (
            '—'
          )}
        </dd>
        <dt className="whitespace-nowrap text-muted-foreground">
          {summary.breakpoint?.label ?? 'Điểm gãy'}
        </dt>
        <dd className="text-right tabular-nums">{summary.breakpoint?.value ?? 'Chưa vượt'}</dd>
      </dl>
      <div className="mt-auto">
        {summary.cases > 0 ? (
          <Link
            to={casesHref(summary.attackSpecId, summary.worst?.level)}
            className={LINK}
            aria-label={`Xem ảnh hỏng của ${summary.label}`}
          >
            Xem ảnh hỏng ({summary.cases})
          </Link>
        ) : (
          <p className="flex min-h-11 items-center text-sm text-muted-foreground">
            Chưa có ảnh hỏng được lưu
          </p>
        )}
      </div>
    </li>
  )
}

function SeverityCards({ summaries }: { summaries: AttackSummary[] }) {
  return (
    <section aria-labelledby="muc-nghiem-trong" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="muc-nghiem-trong" className="text-base font-semibold">
          Mức nghiêm trọng theo attack
        </h3>
        <p className="text-xs text-muted-foreground">
          {(['ok', 'warn', 'severe'] as Severity[])
            .map((s) => `${SEVERITY_LABEL[s]}: ${SEVERITY_RANGE[s]}`)
            .join('; ')}
          {' (mAP@0.5 so với ảnh sạch)'}
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {summaries.map((s) => (
          <SeverityCard key={s.attackSpecId} summary={s} />
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- Ma trận nhiệt

function cellText(cell: HeatCell): string {
  if (cell.earlyStop) return 'Dừng sớm'
  if (cell.drop === null) return '—'
  return `${formatDrop(cell.drop)}${cell.partial ? ' ◇' : ''}`
}

function HeatTable({
  group,
  onFocusCell,
}: {
  group: HeatGroup
  onFocusCell: (text: string | null) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <caption className="sr-only">
          Mức sụt mAP@0.5 theo attack (hàng) và {group.axisTitle.toLowerCase()} (cột)
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="w-36 px-2 text-left text-xs font-medium text-muted-foreground"
            >
              Attack
            </th>
            <th
              scope="colgroup"
              colSpan={group.levels.length}
              className="px-2 pb-1 text-center text-xs font-medium text-muted-foreground"
            >
              {group.axisTitle}
            </th>
          </tr>
          <tr>
            <td />
            {group.levelLabels.map((label) => (
              <th
                key={label}
                scope="col"
                className="min-w-16 px-2 text-center text-xs font-semibold tabular-nums"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.attackSpecId}>
              <th scope="row" className="px-2 text-left font-medium whitespace-nowrap">
                {row.label}
              </th>
              {row.cells.map((cell, i) => {
                const key = `${row.attackSpecId}-${String(group.levels[i])}`
                if (!cell) {
                  return (
                    <td
                      key={key}
                      className="h-11 rounded-md bg-muted/40 text-center text-muted-foreground"
                    >
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Không chạy mức này</span>
                    </td>
                  )
                }
                const stop = cell.drop === null ? null : heatStop(cell.drop)
                return (
                  <td key={key} className="p-0">
                    <Link
                      to={casesHref(cell.attackSpecId, cell.level)}
                      aria-label={cell.description}
                      title={cell.description}
                      onMouseEnter={() => onFocusCell(cell.description)}
                      onFocus={() => onFocusCell(cell.description)}
                      onMouseLeave={() => onFocusCell(null)}
                      onBlur={() => onFocusCell(null)}
                      style={stop ? { background: stop.background } : undefined}
                      className={`flex min-h-11 items-center justify-center rounded-md px-2 font-semibold whitespace-nowrap tabular-nums outline-offset-2 hover:ring-2 hover:ring-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none ${
                        stop
                          ? stop.darkText
                            ? 'text-white'
                            : 'text-foreground'
                          : 'bg-muted/40 text-xs font-medium text-muted-foreground'
                      }`}
                    >
                      {cellText(cell)}
                    </Link>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <span className="font-medium text-muted-foreground">Mức sụt mAP@0.5:</span>
      <ol className="flex flex-wrap gap-1" aria-label="Thang màu mức sụt mAP@0.5">
        {HEAT_STOPS.map((stop) => (
          <li
            key={stop.label}
            style={{ background: stop.background }}
            className={`rounded px-2 py-1 font-semibold tabular-nums ${stop.darkText ? 'text-white' : 'text-foreground'}`}
          >
            {stop.label}
          </li>
        ))}
      </ol>
      <span className="text-muted-foreground">— không chạy mức này; ◇ số liệu một phần</span>
    </div>
  )
}

function Heatmap({ groups }: { groups: HeatGroup[] }) {
  const [focused, setFocused] = useState<string | null>(null)
  return (
    <section aria-labelledby="ma-tran-diem-yeu" className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="tile size-9 [--tile-bg:#ede9fe] [--tile-fg:#6d28d9]">
          <Grid3x3 aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 id="ma-tran-diem-yeu" className="text-base font-semibold">
            Ma trận điểm yếu
          </h3>
          <p className="text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Cách đọc:</strong> mỗi hàng là một
            attack, mỗi cột là một mức nhiễu; số trong ô là phần trăm mAP@0.5 bị mất so với ảnh
            sạch. Ô càng đỏ, model càng yếu. Bấm vào ô để xem ảnh hỏng ở đúng attack và mức đó.
          </p>
        </div>
      </div>
      <HeatLegend />
      {groups.map((group) => (
        <HeatTable key={group.key} group={group} onFocusCell={setFocused} />
      ))}
      <p
        className="min-h-6 rounded-md bg-muted/50 px-3 py-2 text-sm"
        aria-hidden="true"
        data-testid="heat-detail"
      >
        {focused ?? 'Rê chuột hoặc dùng phím Tab vào một ô để đọc giải thích đầy đủ.'}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- Tổng hợp

/**
 * Đầu tab Kết quả: model yếu ở đâu (kết luận nhanh, thẻ mức nghiêm trọng theo attack, ma trận
 * attack × mức nhiễu). Mọi câu và ô chỉ tới attack/level cụ thể đều link sang failure case đã lọc.
 */
export function WeaknessOverview({
  experiment,
  runs,
  heatmapAttackIds,
}: {
  experiment: ExperimentDetail
  runs: RunView[]
  /** Attack đưa vào ma trận (quét lưới); attack tìm ngưỡng chỉ có thẻ. */
  heatmapAttackIds: Set<string>
}) {
  const summaries = attackSummaries(experiment, runs)
  const groups = heatmapGroups(runs, heatmapAttackIds)
  if (summaries.length === 0) return null
  return (
    <div className="flex flex-col gap-4" data-testid="weakness-overview">
      <div className="flex flex-col gap-4">
        <QuickInsights experiment={experiment} runs={runs} />
        <SeverityCards summaries={summaries} />
      </div>
      {groups.length > 0 && <Heatmap groups={groups} />}
    </div>
  )
}
