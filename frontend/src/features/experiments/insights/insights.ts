/**
 * Logic thuần cho phần "Điểm yếu của model" ở đầu tab Kết quả: mức nghiêm trọng, thẻ theo attack,
 * câu kết luận nhanh và ma trận nhiệt attack × mức nhiễu. Không phụ thuộc React để test riêng.
 */
import type { ExperimentDetail, RunView } from '@/contracts/api'

// ---------------------------------------------------------------- Mức nghiêm trọng

/** Ngưỡng mức sụt tương đối mAP@0.5 (0–1): dưới `warn` là ổn, từ `severe` trở lên là nghiêm trọng. */
export const SEVERITY_THRESHOLDS = { warn: 0.1, severe: 0.3 } as const

export type Severity = 'ok' | 'warn' | 'severe'

export const SEVERITY_LABEL: Record<Severity, string> = {
  ok: 'Ổn',
  warn: 'Đáng lo',
  severe: 'Nghiêm trọng',
}

export const SEVERITY_RANGE: Record<Severity, string> = {
  ok: `sụt dưới ${pct(SEVERITY_THRESHOLDS.warn)}`,
  warn: `sụt ${pct(SEVERITY_THRESHOLDS.warn)}–${pct(SEVERITY_THRESHOLDS.severe)}`,
  severe: `sụt trên ${pct(SEVERITY_THRESHOLDS.severe)}`,
}

export function severityOf(drop: number | null): Severity | null {
  if (drop === null) return null
  if (drop >= SEVERITY_THRESHOLDS.severe) return 'severe'
  if (drop >= SEVERITY_THRESHOLDS.warn) return 'warn'
  return 'ok'
}

// ---------------------------------------------------------------- Định dạng

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** Mức sụt cho câu chữ và ô: 0.567 → "57%", số âm (mAP tăng) → "−2%". */
export function formatDrop(drop: number): string {
  const rounded = Math.round(drop * 100)
  return rounded < 0 ? `−${String(-rounded)}%` : `${String(rounded)}%`
}

const ATTACK_LABEL: Record<string, string> = {
  fgsm: 'FGSM',
  pgd_linf: 'PGD (L∞)',
  pgd_l2: 'PGD (L2)',
  adv_patch: 'Patch đối kháng',
  bbox_occlusion: 'Che khuất object',
  fog: 'Sương mù',
  snow: 'Tuyết',
  frost: 'Băng giá',
  motion_blur: 'Nhòe chuyển động',
  contrast: 'Giảm tương phản',
  brightness: 'Độ sáng',
  gaussian_noise: 'Nhiễu Gauss',
}

/** Tên attack dễ đọc; tên lạ giữ nguyên. */
export function attackLabel(name: string): string {
  return ATTACK_LABEL[name] ?? name
}

const CLASS_LABEL: Record<string, string> = {
  person: 'người',
  pedestrian: 'người đi bộ',
  cyclist: 'người đi xe đạp',
  bicycle: 'xe đạp',
  car: 'ô tô',
  truck: 'xe tải',
  bus: 'xe buýt',
  motorcycle: 'xe máy',
  van: 'xe van',
  tram: 'tàu điện',
  traffic_light: 'đèn giao thông',
  stop_sign: 'biển dừng',
}

/** "người (person)"; class lạ giữ nguyên tên. */
export function classLabel(name: string): string {
  const vi = CLASS_LABEL[name]
  return vi ? `${vi} (${name})` : name
}

function trimNumber(value: number): string {
  return String(Number(value.toPrecision(4)))
}

/** Giá trị level kèm đơn vị: `1/255` → "4/255"; đơn vị trùng tên tham số thì bỏ. */
export function levelValue(level: number, paramName: string, paramUnit: string): string {
  if (paramUnit.startsWith('1/')) return `${trimNumber(level)}/${paramUnit.slice(2)}`
  if (!paramUnit || paramUnit === paramName) return trimNumber(level)
  return `${trimNumber(level)} ${paramUnit}`
}

/** "eps 4/255", "severity 3", "area_ratio 0.25 ratio". */
export function levelText(level: number, paramName: string, paramUnit: string): string {
  return `${paramName} ${levelValue(level, paramName, paramUnit)}`
}

/** Tiêu đề trục mức nhiễu của một nhóm: "Mức eps (x/255)", "Mức severity". */
export function axisTitle(paramName: string, paramUnit: string): string {
  if (paramUnit.startsWith('1/')) return `Mức ${paramName} (x/${paramUnit.slice(2)})`
  if (!paramUnit || paramUnit === paramName) return `Mức ${paramName}`
  return `Mức ${paramName} (${paramUnit})`
}

// ---------------------------------------------------------------- Link tới failure case

/** Search param của tab Failure case lọc theo attack và (tùy chọn) level. */
export const CASES_ATTACK_PARAM = 'attack'
export const CASES_LEVEL_PARAM = 'level'

/** Link tương đối (giữ đường dẫn trang) tới tab Failure case đã lọc. */
export function casesHref(attackSpecId: string, level?: number): string {
  const params = new URLSearchParams({ tab: 'cases', [CASES_ATTACK_PARAM]: attackSpecId })
  if (level !== undefined) params.set(CASES_LEVEL_PARAM, String(level))
  return `?${params.toString()}`
}

/** Bộ lọc đọc từ URL; level không phải số thì bỏ. */
export function readCasesFilter(params: URLSearchParams): {
  attack: string | null
  level: number | null
} {
  const attack = params.get(CASES_ATTACK_PARAM)
  const rawLevel = params.get(CASES_LEVEL_PARAM)
  const level = rawLevel === null || rawLevel === '' ? null : Number(rawLevel)
  return { attack: attack || null, level: level !== null && Number.isFinite(level) ? level : null }
}

/** Run khớp bộ lọc (so level theo sai số dấu phẩy động). */
export function matchesFilter(
  run: Pick<RunView, 'attack_spec_id' | 'level'>,
  filter: { attack: string | null; level: number | null },
): boolean {
  if (filter.attack !== null && run.attack_spec_id !== filter.attack) return false
  if (filter.level !== null && Math.abs(run.level - filter.level) > 1e-9) return false
  return true
}

// ---------------------------------------------------------------- Điểm dữ liệu

/** Một run (attack, level) đã quy về số liệu cần cho phần điểm yếu. */
export interface InsightPoint {
  runId: string
  attackSpecId: string
  name: string
  paramName: string
  paramUnit: string
  level: number
  /** Mức sụt tương đối mAP@0.5 so với ảnh sạch (0–1); null khi không có metric. */
  drop: number | null
  partial: boolean
  earlyStop: boolean
  cases: number
  perClass: Record<string, { clean: number | null; attacked: number | null }>
}

/** Run toàn slice (bỏ run tập con của tìm ngưỡng), quy về `InsightPoint`. */
export function insightPoints(runs: RunView[]): InsightPoint[] {
  return runs
    .filter((run) => run.scope !== 'subset')
    .map((run) => {
      const metrics = run.metrics ?? null
      const perClass: InsightPoint['perClass'] = {}
      for (const [cls, m] of Object.entries(metrics?.per_class ?? {})) {
        perClass[cls] = { clean: m.clean_ap50, attacked: m.attacked_ap50 }
      }
      return {
        runId: run.run_id,
        attackSpecId: run.attack_spec_id,
        name: run.attack_spec.name,
        paramName: run.attack_spec.param_name,
        paramUnit: run.attack_spec.param_unit,
        level: run.level,
        drop: metrics?.relative_drop ?? null,
        partial: metrics?.partial ?? false,
        earlyStop: run.status_reason?.code === 'early_stop',
        cases: run.failure_case_ids.length,
        perClass,
      }
    })
}

// ---------------------------------------------------------------- Thẻ theo attack

export interface Breakpoint {
  level: number
  /** "Điểm gãy theo ngưỡng protocol" (tìm ngưỡng) hoặc "Sụt quá 30% từ" (quét lưới). */
  label: string
  value: string
}

export interface AttackSummary {
  attackSpecId: string
  name: string
  label: string
  paramName: string
  paramUnit: string
  /** Level có mức sụt lớn nhất; null khi chưa run nào có metric. */
  worst: { level: number; drop: number; partial: boolean } | null
  severity: Severity | null
  breakpoint: Breakpoint | null
  levelsWithData: number
  cases: number
}

function groupByAttack(points: InsightPoint[]): Map<string, InsightPoint[]> {
  const map = new Map<string, InsightPoint[]>()
  for (const point of points) {
    const list = map.get(point.attackSpecId) ?? []
    list.push(point)
    map.set(point.attackSpecId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.level - b.level)
  return map
}

/**
 * Một thẻ mỗi attack, xếp nặng nhất trước (attack chưa có metric xếp cuối). Điểm gãy: attack tìm
 * ngưỡng lấy `breaking_point` của backend (ngưỡng protocol); attack quét lưới lấy level nhỏ nhất có
 * mức sụt ≥ ngưỡng "Nghiêm trọng".
 */
export function attackSummaries(experiment: ExperimentDetail, runs: RunView[]): AttackSummary[] {
  const search = new Map((experiment.search_results ?? []).map((r) => [r.attack_spec_id, r]))
  const summaries: AttackSummary[] = []
  for (const [attackSpecId, points] of groupByAttack(insightPoints(runs))) {
    const first = points[0]
    let worst: AttackSummary['worst'] = null
    for (const p of points) {
      if (p.drop !== null && (worst === null || p.drop > worst.drop)) {
        worst = { level: p.level, drop: p.drop, partial: p.partial }
      }
    }
    let breakpoint: Breakpoint | null = null
    const result = search.get(attackSpecId)
    const found =
      result && (result.status === 'found' || result.status === 'non_monotonic')
        ? (result.breaking_point ?? null)
        : null
    if (found !== null) {
      breakpoint = {
        level: found,
        label: 'Điểm gãy theo ngưỡng protocol',
        value: levelText(found, first.paramName, first.paramUnit),
      }
    } else {
      const crossing = points.find((p) => p.drop !== null && p.drop >= SEVERITY_THRESHOLDS.severe)
      if (crossing) {
        breakpoint = {
          level: crossing.level,
          label: `Sụt quá ${pct(SEVERITY_THRESHOLDS.severe)} từ`,
          value: levelText(crossing.level, first.paramName, first.paramUnit),
        }
      }
    }
    summaries.push({
      attackSpecId,
      name: first.name,
      label: attackLabel(first.name),
      paramName: first.paramName,
      paramUnit: first.paramUnit,
      worst,
      severity: severityOf(worst?.drop ?? null),
      breakpoint,
      levelsWithData: points.filter((p) => p.drop !== null).length,
      cases: points.reduce((sum, p) => sum + p.cases, 0),
    })
  }
  return summaries.sort((a, b) => (b.worst?.drop ?? -Infinity) - (a.worst?.drop ?? -Infinity))
}

// ---------------------------------------------------------------- Kết luận nhanh

export interface InsightSentence {
  id: string
  text: string
  tone: Severity
  /** Link tới failure case đã lọc; null khi câu không chỉ tới một attack cụ thể. */
  href: string | null
  linkLabel: string | null
}

/** Class sụt nhiều nhất ở một run (cần AP sạch > 0). */
export function worstClass(point: InsightPoint): { name: string; drop: number } | null {
  let best: { name: string; drop: number } | null = null
  for (const [name, m] of Object.entries(point.perClass)) {
    if (m.clean === null || m.attacked === null || m.clean <= 0) continue
    const drop = (m.clean - m.attacked) / m.clean
    if (best === null || drop > best.drop) best = { name, drop }
  }
  return best
}

/** 2–4 câu kết luận sinh từ số liệu; rỗng khi chưa run nào có metric. */
export function quickInsights(experiment: ExperimentDetail, runs: RunView[]): InsightSentence[] {
  const summaries = attackSummaries(experiment, runs).filter((s) => s.worst !== null)
  if (summaries.length === 0) return []
  const points = insightPoints(runs).filter((p) => p.drop !== null)
  const sentences: InsightSentence[] = []

  const top = summaries[0]
  const topWorst = top.worst
  if (topWorst) {
    const where = levelText(topWorst.level, top.paramName, top.paramUnit)
    sentences.push({
      id: 'weakest',
      text:
        `Model yếu nhất với ${top.label}: mAP@0.5 giảm ${formatDrop(topWorst.drop)} ở ${where}` +
        (topWorst.partial ? ' (số liệu một phần).' : '.'),
      tone: severityOf(topWorst.drop) ?? 'ok',
      href: casesHref(top.attackSpecId, topWorst.level),
      linkLabel: `Xem ảnh hỏng của ${top.label} ở ${where}`,
    })
  }

  // Class bị ảnh hưởng nặng nhất trên mọi run có số liệu theo class.
  let classHit: { point: InsightPoint; name: string; drop: number } | null = null
  for (const point of points) {
    const hit = worstClass(point)
    if (hit && (classHit === null || hit.drop > classHit.drop)) classHit = { point, ...hit }
  }
  if (classHit) {
    const { point } = classHit
    const where = levelText(point.level, point.paramName, point.paramUnit)
    sentences.push({
      id: 'class',
      text:
        `Lớp ${classLabel(classHit.name)} bị ảnh hưởng nặng nhất: AP@0.5 giảm ` +
        `${formatDrop(classHit.drop)} với ${attackLabel(point.name)} ở ${where}.`,
      tone: severityOf(classHit.drop) ?? 'ok',
      href: casesHref(point.attackSpecId, point.level),
      linkLabel: `Xem ảnh hỏng của ${attackLabel(point.name)} ở ${where}`,
    })
  }

  // Điểm nhẹ nhất (attack khác attack yếu nhất nếu có) dưới ngưỡng "Đáng lo".
  // Ưu tiên attack khác attack yếu nhất để câu thứ ba nói điều mới.
  const otherFirst = (p: InsightPoint) => (p.attackSpecId === top.attackSpecId ? 1 : 0)
  const mild = points
    .filter((p) => (p.drop ?? 0) < SEVERITY_THRESHOLDS.warn)
    .sort((a, b) => otherFirst(a) - otherFirst(b) || (a.drop ?? 0) - (b.drop ?? 0))[0]
  if (mild && mild.drop !== null) {
    const where = levelText(mild.level, mild.paramName, mild.paramUnit)
    sentences.push({
      id: 'mild',
      text:
        `${attackLabel(mild.name)} ở ${where} gần như không ảnh hưởng ` +
        `(${mild.drop < 0 ? `mAP@0.5 tăng ${formatDrop(-mild.drop)}` : `giảm ${formatDrop(mild.drop)}`}).`,
      tone: 'ok',
      href: casesHref(mild.attackSpecId, mild.level),
      linkLabel: `Xem ảnh hỏng của ${attackLabel(mild.name)} ở ${where}`,
    })
  }

  const severe = summaries.filter((s) => s.severity === 'severe').length
  sentences.push({
    id: 'count',
    text:
      severe > 0
        ? `${String(severe)}/${String(summaries.length)} attack làm mAP@0.5 sụt quá ` +
          `${pct(SEVERITY_THRESHOLDS.severe)} ở ít nhất một mức nhiễu.`
        : `Không attack nào làm mAP@0.5 sụt quá ${pct(SEVERITY_THRESHOLDS.severe)} ` +
          `trong dải đã chạy.`,
    tone: severe > 0 ? 'severe' : 'ok',
    href: null,
    linkLabel: null,
  })
  return sentences
}

// ---------------------------------------------------------------- Ma trận nhiệt

export interface HeatCell {
  runId: string
  attackSpecId: string
  level: number
  drop: number | null
  /** Phần mAP@0.5 còn giữ được so với ảnh sạch (1 − drop). */
  retained: number | null
  partial: boolean
  earlyStop: boolean
  cases: number
  /** Câu mô tả đầy đủ cho tooltip và trình đọc màn hình. */
  description: string
}

export interface HeatRow {
  attackSpecId: string
  label: string
  /** Theo thứ tự `HeatGroup.levels`; null khi attack không chạy level đó. */
  cells: (HeatCell | null)[]
}

/** Một bảng: các attack cùng tham số và đơn vị (mới so cột được với nhau). */
export interface HeatGroup {
  key: string
  paramName: string
  paramUnit: string
  axisTitle: string
  levels: number[]
  levelLabels: string[]
  rows: HeatRow[]
}

export function describeCell(
  label: string,
  where: string,
  cell: Pick<HeatCell, 'drop' | 'partial' | 'earlyStop' | 'cases'>,
): string {
  if (cell.earlyStop) {
    return `${label} ở mức ${where}: không chạy vì model đã sụp ở mức thấp hơn (dừng sớm).`
  }
  if (cell.drop === null) return `${label} ở mức ${where}: chưa có số liệu.`
  const retained = formatDrop(1 - cell.drop)
  const change =
    cell.drop < 0
      ? `mAP@0.5 tăng ${formatDrop(-cell.drop)} so với ảnh sạch`
      : `mAP@0.5 giảm ${formatDrop(cell.drop)}, model chỉ còn nhận ra ${retained} so với ảnh sạch`
  const partial = cell.partial ? ' Số liệu chỉ tính trên phần ảnh đã xử lý.' : ''
  const cases =
    cell.cases > 0 ? ` Có ${String(cell.cases)} ảnh hỏng để xem.` : ' Chưa có ảnh hỏng được lưu.'
  return `Với ${label} ở mức ${where}, ${change}.${partial}${cases}`
}

/**
 * Ma trận attack × level của mức sụt tương đối mAP@0.5. Chỉ gồm attack trong `attackIds` (quét
 * lưới); attack khác tham số/đơn vị nằm ở bảng riêng. Hàng xếp theo mức sụt lớn nhất giảm dần.
 */
export function heatmapGroups(runs: RunView[], attackIds?: Set<string>): HeatGroup[] {
  const points = insightPoints(runs).filter((p) => !attackIds || attackIds.has(p.attackSpecId))
  const groups = new Map<string, { paramName: string; paramUnit: string; points: InsightPoint[] }>()
  for (const point of points) {
    const key = `${point.paramName}|${point.paramUnit}`
    const group = groups.get(key) ?? {
      paramName: point.paramName,
      paramUnit: point.paramUnit,
      points: [],
    }
    group.points.push(point)
    groups.set(key, group)
  }
  const result: HeatGroup[] = []
  for (const [key, group] of groups) {
    const levels = [...new Set(group.points.map((p) => p.level))].sort((a, b) => a - b)
    const rows: { row: HeatRow; worst: number }[] = []
    for (const [attackSpecId, list] of groupByAttack(group.points)) {
      const label = attackLabel(list[0].name)
      const cells = levels.map((level): HeatCell | null => {
        const matches = list.filter((p) => Math.abs(p.level - level) < 1e-9)
        if (matches.length === 0) return null
        const p = matches.find((m) => m.drop !== null) ?? matches[matches.length - 1]
        const where = levelValue(level, group.paramName, group.paramUnit)
        return {
          runId: p.runId,
          attackSpecId,
          level,
          drop: p.drop,
          retained: p.drop === null ? null : 1 - p.drop,
          partial: p.partial,
          earlyStop: p.earlyStop && p.drop === null,
          cases: p.cases,
          description: describeCell(label, where, p),
        }
      })
      const worst = Math.max(-Infinity, ...cells.map((c) => c?.drop ?? -Infinity))
      rows.push({ row: { attackSpecId, label, cells }, worst })
    }
    // Bảng không có ô nào có số liệu (vd. mọi run lỗi) thì bỏ: chỉ toàn "—".
    if (
      rows.every(({ row }) =>
        row.cells.every((c) => c === null || (c.drop === null && !c.earlyStop)),
      )
    )
      continue
    rows.sort((a, b) => b.worst - a.worst)
    result.push({
      key,
      paramName: group.paramName,
      paramUnit: group.paramUnit,
      axisTitle: axisTitle(group.paramName, group.paramUnit),
      levels,
      levelLabels: levels.map((l) => levelValue(l, group.paramName, group.paramUnit)),
      rows: rows.map(({ row }) => row),
    })
  }
  // Bảng có nhiều attack hơn đứng trước.
  return result.sort((a, b) => b.rows.length - a.rows.length)
}

// ---------------------------------------------------------------- Thang màu

export interface HeatStop {
  /** Cận dưới (mức sụt 0–1) của dải. */
  from: number
  label: string
  /** Nền ô (CSS, dùng token màu ngữ nghĩa). */
  background: string
  /** Chữ trắng trên nền đậm để giữ tương phản WCAG AA. */
  darkText: boolean
}

const mix = (token: string, amount: number, base: string) =>
  `color-mix(in oklab, var(${token}) ${String(amount)}%, ${base})`

/** Thang màu theo mức sụt: xanh (ổn) → hổ phách (đáng lo) → đỏ đậm dần (nghiêm trọng). */
export const HEAT_STOPS: HeatStop[] = [
  {
    from: -Infinity,
    label: '< 10%',
    background: mix('--approved', 16, 'var(--surface-solid)'),
    darkText: false,
  },
  {
    from: 0.1,
    label: '10–20%',
    background: mix('--threshold', 20, 'var(--surface-solid)'),
    darkText: false,
  },
  {
    from: 0.2,
    label: '20–30%',
    background: mix('--threshold', 38, 'var(--surface-solid)'),
    darkText: false,
  },
  {
    from: 0.3,
    label: '30–50%',
    background: mix('--fail', 45, 'var(--surface-solid)'),
    darkText: false,
  },
  { from: 0.5, label: '50–70%', background: mix('--fail', 78, 'black'), darkText: true },
  { from: 0.7, label: '≥ 70%', background: mix('--fail', 55, 'black'), darkText: true },
]

export function heatStop(drop: number): HeatStop {
  let stop = HEAT_STOPS[0]
  for (const s of HEAT_STOPS) if (drop >= s.from) stop = s
  return stop
}
