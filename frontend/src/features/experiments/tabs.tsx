import { Download, EyeOff, TriangleAlert } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { middleTruncate } from '@/admin/format'
import { AttackRanking } from '@/components/charts/AttackRanking'
import { gridAttackIds } from '@/components/charts/breakpoints'
import { MetricCurves } from '@/components/charts/MetricCurves'
import { CopyButton } from '@/components/CopyButton'
import { WATERMARK } from '@/components/case-viewer/CaseViewer'
import { LoadError } from '@/components/LoadError'
import { PageLoading } from '@/components/PageLoading'
import { StatusBadge } from '@/components/status/StatusBadge'
import type { ExperimentDetail, FailureCaseView, Manifest, RunView } from '@/contracts/api'

import { artifactSrc, useFailureCases, useManifest } from './api'
import { BreakingPoints } from './BreakingPoints'
import { downloadJson, formatDuration, reasonText, runLabel } from './format'
import {
  attackLabel,
  casesHref,
  levelText,
  matchesFilter,
  readCasesFilter,
} from './insights/insights'
import { WeaknessOverview } from './insights/WeaknessOverview'
import { ProgressBar } from './ProgressBar'
import { RunProgress } from './RunProgress'

// ---------------------------------------------------------------- Tổng quan

export function RunsTable({ runs }: { runs: RunView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Danh sách run</caption>
        <thead className="bg-muted/50">
          <tr>
            {['Attack', 'Level', 'Trạng thái', 'Lý do', 'Tiến độ', 'Thời gian'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.run_id} className="border-t border-border align-top">
              <td className="px-3 py-2">{run.attack_spec.name}</td>
              <td className="px-3 py-2 tabular-nums">
                {run.level} {run.attack_spec.param_unit}
              </td>
              <td className="px-3 py-2">
                <StatusBadge kind="run" status={run.status} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">{reasonText(run, runs) ?? '—'}</td>
              <td className="px-3 py-2">
                <RunProgress run={run} />
              </td>
              <td className="px-3 py-2 tabular-nums">
                {run.gpu_seconds > 0 ? formatDuration(run.gpu_seconds) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Kết quả

export function ResultsTab({
  experiment,
  runs,
}: {
  experiment: ExperimentDetail
  runs: RunView[]
}) {
  // Phase 7: xếp hạng và đường cong chỉ gồm attack quét lưới; run tìm ngưỡng (kể cả tập con)
  // nằm ở mục "Điểm gãy".
  const grid = gridAttackIds(experiment)
  const gridRuns = runs.filter((run) => grid.has(run.attack_spec_id))
  const hasSearch = experiment.config.attacks.some((a) => a.mode === 'search')
  const ranking = experiment.attack_ranking ?? []
  return (
    <div className="space-y-6">
      <WeaknessOverview experiment={experiment} runs={runs} heatmapAttackIds={grid} />
      {hasSearch && (
        <div className="panel space-y-2 p-5">
          <p className="text-sm">
            Điểm gãy là mức nhiễu nhỏ nhất làm model vượt ngưỡng của protocol: giá trị càng nhỏ,
            model càng dễ gãy trước attack đó.
          </p>
          <BreakingPoints experiment={experiment} runs={runs} />
        </div>
      )}
      {ranking.length > 0 && (
        <div className="panel p-5">
          <AttackRanking
            ranking={ranking}
            caption="Cột càng dài, attack càng làm model sụt nhiều trên toàn dải mức nhiễu; attack đứng đầu là điểm yếu lớn nhất."
          />
        </div>
      )}
      {grid.size > 0 && (
        <section aria-labelledby="duong-cong" className="panel space-y-3 p-5">
          <h3 id="duong-cong" className="font-semibold">
            Đường cong theo mức nhiễu
          </h3>
          <MetricCurves
            runs={gridRuns}
            cleanMap50={experiment.clean_metrics?.map50 ?? null}
            caption="Mỗi khối là một attack: đường mAP@0.5 càng dốc xuống khi mức nhiễu tăng, model càng mất khả năng nhận diện; đường nét đứt là mAP trên ảnh sạch để so sánh."
          />
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Failure case

function CaseTile({ view, runId }: { view: FailureCaseView; runId: string }) {
  const src = artifactSrc(view.urls.adversarial_thumb ?? view.urls.clean_thumb)
  return (
    <Link
      to={`/failure-cases/${view.id}?run=${runId}`}
      className="group flex flex-col gap-1 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {src ? (
          <img
            src={src}
            alt={`Ảnh ${view.image_id}`}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
            <EyeOff aria-hidden="true" className="size-5" />
            Ảnh bị ẩn
          </div>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[10px] font-bold text-white/70 [text-shadow:0_0_2px_rgba(0,0,0,0.9)]"
        >
          <span className="-rotate-30">{WATERMARK}</span>
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {view.image_id} · mức {view.severity_score}
      </span>
    </Link>
  )
}

function RunCases({ run }: { run: RunView }) {
  const cases = useFailureCases(run.run_id)
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{runLabel(run)}</h3>
      {cases.isPending ? (
        <PageLoading />
      ) : cases.isError ? (
        <LoadError onRetry={() => void cases.refetch()} retrying={cases.isFetching} />
      ) : (
        <>
          {cases.data[0]?.display_mode === 'dev_unblurred' && (
            <p className="text-sm text-threshold">Chưa làm mờ – chỉ dùng cho phát triển</p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cases.data.map((view) => (
              <li key={view.id}>
                <CaseTile view={view} runId={run.run_id} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const CHIP =
  'inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium ring-1 ring-line focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

/** Lọc case theo attack (và level) từ URL: `?tab=cases&attack=<attack_spec_id>&level=4`. */
function CaseFilter({
  runs,
  filter,
}: {
  runs: RunView[]
  filter: { attack: string | null; level: number | null }
}) {
  const attacks = [...new Map(runs.map((run) => [run.attack_spec_id, run])).values()]
  const levelRun =
    filter.level === null ? undefined : runs.find((run) => matchesFilter(run, filter))
  return (
    <nav aria-label="Lọc failure case theo attack" className="flex flex-wrap items-center gap-2">
      <Link
        to="?tab=cases"
        aria-current={filter.attack === null ? 'true' : undefined}
        className={`${CHIP} ${filter.attack === null ? 'bg-navy text-white' : 'hover:bg-muted'}`}
      >
        Tất cả attack
      </Link>
      {attacks.map((run) => {
        const active = filter.attack === run.attack_spec_id
        return (
          <Link
            key={run.attack_spec_id}
            to={casesHref(run.attack_spec_id)}
            aria-current={active ? 'true' : undefined}
            className={`${CHIP} ${active ? 'bg-navy text-white' : 'hover:bg-muted'}`}
          >
            {attackLabel(run.attack_spec.name)}
          </Link>
        )
      })}
      {filter.attack !== null && filter.level !== null && (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          chỉ mức{' '}
          {levelRun
            ? levelText(
                filter.level,
                levelRun.attack_spec.param_name,
                levelRun.attack_spec.param_unit,
              )
            : filter.level}
          <Link to={casesHref(filter.attack)} className={`${CHIP} ml-1 hover:bg-muted`}>
            Xem mọi mức
          </Link>
        </span>
      )}
    </nav>
  )
}

export function FailureCasesTab({ runs }: { runs: RunView[] }) {
  const [params] = useSearchParams()
  const filter = readCasesFilter(params)
  const withCases = runs.filter((run) => run.failure_case_ids.length > 0)
  if (withCases.length === 0) {
    return <p className="text-muted-foreground">Chưa có failure case nào.</p>
  }
  const shown = withCases.filter((run) => matchesFilter(run, filter))
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {WATERMARK}: kết quả chưa được reviewer duyệt. Case sắp theo mức nghiêm trọng giảm dần.
      </p>
      <CaseFilter runs={withCases} filter={filter} />
      {shown.length === 0 ? (
        <p className="text-muted-foreground">
          Không có ảnh hỏng nào được lưu cho lựa chọn này: model không làm mất object nào ở attack
          và mức đã chọn, hoặc run chưa xong.
        </p>
      ) : (
        shown.map((run) => <RunCases key={run.run_id} run={run} />)
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Chi phí

export function CostTab({ experiment, runs }: { experiment: ExperimentDetail; runs: RunView[] }) {
  const limit = Number(experiment.limit.value)
  const used = experiment.processing_seconds_used
  return (
    <div className="space-y-4">
      <div className="max-w-xl space-y-2">
        <p>
          Thời gian xử lý đã dùng: <strong>{formatDuration(used)}</strong> / giới hạn{' '}
          {formatDuration(limit)}
        </p>
        <ProgressBar
          progress={{ images_done: Math.min(used, limit), images_total: limit }}
          label={`${Math.min(100, Math.round((used / limit) * 100))}%`}
        />
        <p className="text-sm text-muted-foreground">
          Máy local: không tính tiền. Chạm giới hạn thì dừng và giữ kết quả một phần.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <caption className="text-left font-medium">Thời gian từng run</caption>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id} className="border-t">
                <td className="py-1 pr-3">{runLabel(run)}</td>
                <td className="py-1 tabular-nums">
                  {run.gpu_seconds > 0 ? formatDuration(run.gpu_seconds) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Tái lập

function ManifestDetails({ manifest, runId }: { manifest: Manifest; runId: string }) {
  const inputs = manifest.fingerprint_inputs
  const env = manifest.environment
  const rows: [string, string][] = [
    ['Git commit', inputs.git_commit],
    ['Docker image', inputs.docker_image_digest],
    ...Object.entries(inputs.lib_versions).map(([lib, v]) => [lib, v] as [string, string]),
    ['GPU', env.gpu_model ?? 'CPU'],
    ['CUDA / driver', `${env.cuda_version ?? '—'} / ${env.driver_version ?? '—'}`],
    ['Seed', String(inputs.seed)],
  ]
  return (
    <div className="space-y-2">
      {inputs.git_dirty && (
        <p role="alert" className="flex items-center gap-2 text-sm text-threshold">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          Chạy từ code có thay đổi chưa commit (git_dirty): kết quả có thể khó tái lập.
        </p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={() => downloadJson(manifest, `manifest-${runId}.json`)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
      >
        <Download aria-hidden="true" className="size-4" />
        Tải manifest.json
      </button>
    </div>
  )
}

function ReproRun({ run }: { run: RunView }) {
  const manifest = useManifest(run.run_id, run.manifest_uri !== null)
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{runLabel(run)}</h3>
        <StatusBadge kind="run" status={run.status} />
      </div>
      {run.fingerprint === null ? (
        <p className="text-sm text-muted-foreground">Chưa chạy: chưa có fingerprint.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Fingerprint</span>
          <code className="font-mono text-xs" title={run.fingerprint}>
            {middleTruncate(run.fingerprint, 10, 6)}
          </code>
          <CopyButton value={run.fingerprint} label="Copy fingerprint" />
        </div>
      )}
      {run.manifest_uri === null ? null : manifest.isPending ? (
        <PageLoading />
      ) : manifest.isError ? (
        <LoadError onRetry={() => void manifest.refetch()} retrying={manifest.isFetching} />
      ) : (
        <ManifestDetails manifest={manifest.data} runId={run.run_id} />
      )}
    </section>
  )
}

export function ReproTab({ runs }: { runs: RunView[] }) {
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <ReproRun key={run.run_id} run={run} />
      ))}
    </div>
  )
}
