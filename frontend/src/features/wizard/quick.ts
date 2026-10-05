/**
 * Mẫu experiment và "Cấu hình nhanh" (góp ý mentor: bớt bấm, cho chọn thay vì tự điền). Thuần:
 * chọn protocol, model, dataset version, slice, máy chạy theo luật cố định; tính bước còn thiếu
 * và các bước được phép nhảy tới.
 */
import type {
  AttackSpec,
  ComputeTargetPublic,
  DatasetSummary,
  ModelSummary,
  ProtocolSummary,
  SliceSummary,
} from '@/contracts/api'

import { catalogPreset } from './levels'
import { type AttackDraft, canAdvance, type Draft, type Step } from './state'

export interface ExperimentTemplate {
  id: 'fast' | 'probe' | 'full'
  title: string
  description: string
  /** Mẫu chọn gì (gạch đầu dòng ngắn). */
  checks: string[]
  slice: 'largest' | 'smallest'
  /** Attack thêm vào ngoài attack bắt buộc của protocol. */
  extra: 'none' | 'fgsm' | 'catalog'
}

export const EXPERIMENT_TEMPLATES: readonly ExperimentTemplate[] = [
  {
    id: 'fast',
    title: 'Cấu hình nhanh',
    description: 'Một lần bấm, đi thẳng tới bước xác nhận.',
    checks: [
      'Protocol đang dùng mới nhất',
      'Model mới nhất, slice lớn nhất',
      'Attack theo protocol',
    ],
    slice: 'largest',
    extra: 'none',
  },
  {
    id: 'probe',
    title: 'Dò nhanh trên ít ảnh',
    description: 'Chạy thử vài phút để thấy điểm yếu trước khi chạy đủ.',
    checks: ['Slice nhỏ nhất được phép', 'Thêm FGSM eps 2, 4, 8', 'Model mới nhất'],
    slice: 'smallest',
    extra: 'fgsm',
  },
  {
    id: 'full',
    title: 'Toàn bộ catalog',
    description: 'Mọi attack với level gợi ý; dừng ở bước attack để bạn xem lại.',
    checks: ['Slice lớn nhất', 'Mọi attack trong catalog', 'Dừng sớm khi model đã sụp'],
    slice: 'largest',
    extra: 'catalog',
  },
]

/** Protocol đang dùng (active) có version cao nhất; không có thì protocol đầu tiên. */
export function pickProtocol(protocols: ProtocolSummary[]): ProtocolSummary | null {
  const active = protocols.filter((p) => p.status === 'active')
  const pool = active.length > 0 ? active : protocols
  return pool.reduce<ProtocolSummary | null>(
    (best, p) => (best === null || p.version > best.version ? p : best),
    null,
  )
}

const newest = <T extends { created_at: string }>(items: T[]): T | null =>
  items.reduce<T | null>(
    (best, x) => (best === null || x.created_at > best.created_at ? x : best),
    null,
  )

export const pickModel = (models: ModelSummary[]): ModelSummary | null => newest(models)

export function pickDatasetVersion(datasets: DatasetSummary[]): string | null {
  return newest(datasets.flatMap((d) => d.versions))?.id ?? null
}

/** Slice đủ lớn theo protocol: lớn nhất hoặc nhỏ nhất. */
export function pickSlice(
  slices: SliceSummary[],
  minSize: number | null,
  mode: ExperimentTemplate['slice'],
): SliceSummary | null {
  const usable = slices.filter((s) => s.size >= (minSize ?? 0))
  return usable.reduce<SliceSummary | null>((best, s) => {
    if (best === null) return s
    return mode === 'largest' ? (s.size > best.size ? s : best) : s.size < best.size ? s : best
  }, null)
}

/** Máy local, ưu tiên đang online (giống chọn sẵn của wizard). */
export function pickTarget(targets: ComputeTargetPublic[]): ComputeTargetPublic | null {
  const local = targets.filter((t) => t.kind === 'local')
  return local.find((t) => t.online) ?? local[0] ?? null
}

function draftOf(spec: AttackSpec, levels: number[]): AttackDraft {
  return {
    attackSpecId: spec.id,
    specSha256: spec.spec_sha256,
    levels,
    requiresTraining: spec.requires_training === true,
    trainingSliceId: null,
    mode: 'grid',
    search: null,
  }
}

/**
 * Attack thêm theo mẫu (trước khi áp khóa protocol): `fgsm` thêm FGSM eps 2, 4, 8; `catalog` mọi
 * attack; `none` chỉ thêm FGSM khi protocol không bắt buộc attack nào (để có gì mà chạy).
 */
export function templateAttacks(
  template: ExperimentTemplate,
  current: AttackDraft[],
  specs: AttackSpec[],
): AttackDraft[] {
  if (template.extra === 'catalog') return catalogPreset(specs)
  const fgsm = specs.find((s) => s.name === 'fgsm')
  const wantFgsm = template.extra === 'fgsm' || current.length === 0
  if (!fgsm || !wantFgsm || current.some((a) => a.attackSpecId === fgsm.id)) return current
  const { min, max } = fgsm.primary_param
  const levels = [2, 4, 8].filter((l) => l >= min && l <= max)
  return [...current, draftOf(fgsm, levels)]
}

export interface AdvanceOptions {
  maxLimitSeconds?: number
  levelInputError?: boolean
}

/** Bước đầu tiên còn thiếu (6 nếu đủ hết). */
export function firstIncomplete(draft: Draft, options: AdvanceOptions = {}): Step {
  for (const step of [1, 2, 3, 4, 5] as const) {
    if (!canAdvance({ ...draft, step }, options)) return step
  }
  return 6
}

/** Bước nhảy tới được: mọi bước trước nó đã đủ (và bước đang đứng). */
export function reachableSteps(draft: Draft, options: AdvanceOptions = {}): Step[] {
  const last = Math.max(firstIncomplete(draft, options), draft.step)
  return ([1, 2, 3, 4, 5, 6] as const).filter((s) => s <= last)
}
