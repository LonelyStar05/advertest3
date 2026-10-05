/**
 * Mẫu protocol và giá trị mặc định cho form (góp ý mentor: cho chọn thay vì gõ). Thuần, không gọi
 * API: chỉ cần attack catalog để biết mẫu nào dùng được và điền đúng dải của spec.
 */
import type { AttackSpec } from '@/contracts/api'
import { recommendedLevels } from '@/lib/attack-kinds'

import {
  type AttackRow,
  type CriterionRow,
  EMPTY_ATTACK,
  EMPTY_CRITERION,
  formatLevels,
  parseLevels,
  type ProtocolForm,
} from './form'

export interface TemplateAttack {
  name: string
  levels: number[]
  /** Tiêu chí mức sụt tương đối tối đa tại `level` (phần trăm). */
  criterion?: { level: number; maxDropPct: number }
}

export interface ProtocolTemplate {
  id: 'quick' | 'safety' | 'weather'
  title: string
  /** Một câu: mẫu dùng khi nào. */
  description: string
  /** Mẫu kiểm điều gì (hiện dạng gạch đầu dòng ngắn). */
  checks: string[]
  /** Tên gợi ý (thêm ngày tạo để khỏi trùng). */
  name: string
  purpose: string
  attacks: TemplateAttack[]
  /** `all`: cần đủ mọi attack trong catalog; `any`: dùng các attack có sẵn, ít nhất một. */
  need: 'all' | 'any'
  minSliceSize: number
  casesPerAttack: number
}

export const PROTOCOL_TEMPLATES: readonly ProtocolTemplate[] = [
  {
    id: 'quick',
    title: 'Kiểm nhanh',
    description: 'Dò điểm yếu đầu tiên trong vài phút trên slice nhỏ.',
    checks: ['FGSM eps 2, 4, 8', 'Sụt tối đa 50% ở eps 8', '2 case review mỗi attack'],
    name: 'Kiểm nhanh FGSM',
    purpose:
      'Kiểm nhanh độ bền của model với nhiễu nhỏ một bước (FGSM). Không đạt nếu mAP sụt quá 50% ở eps 8.',
    attacks: [{ name: 'fgsm', levels: [2, 4, 8], criterion: { level: 8, maxDropPct: 50 } }],
    need: 'all',
    minSliceSize: 5,
    casesPerAttack: 2,
  },
  {
    id: 'safety',
    title: 'Chuẩn an toàn',
    description: 'Mức nên dùng trước khi phát hành model ra xe thật.',
    checks: ['FGSM và PGD L∞ eps 2, 4, 8', 'Sụt tối đa 40% ở eps 4', '3 case review mỗi attack'],
    name: 'Chuẩn an toàn FGSM + PGD',
    purpose:
      'Chặn phát hành nếu model sụt quá 40% mAP ở eps 4 với FGSM hoặc PGD L∞ (nhiễu tối ưu nhiều bước).',
    attacks: [
      { name: 'fgsm', levels: [2, 4, 8], criterion: { level: 4, maxDropPct: 40 } },
      { name: 'pgd_linf', levels: [2, 4, 8], criterion: { level: 4, maxDropPct: 40 } },
    ],
    need: 'all',
    minSliceSize: 20,
    casesPerAttack: 3,
  },
  {
    id: 'weather',
    title: 'Thời tiết xấu',
    description: 'Camera gặp sương mù, tuyết hay băng giá: rủi ro không cần kẻ tấn công.',
    checks: [
      'Sương, tuyết, băng giá mức 1, 3, 5',
      'Sụt tối đa 40% ở mức 3',
      '2 case review mỗi loại',
    ],
    name: 'Thời tiết xấu',
    purpose:
      'Kiểm model khi thời tiết xấu làm ảnh mờ, nhiễu. Không đạt nếu mAP sụt quá 40% ở mức severity 3.',
    attacks: ['fog', 'rain', 'snow', 'frost'].map((name) => ({
      name,
      levels: [1, 3, 5],
      criterion: { level: 3, maxDropPct: 40 },
    })),
    need: 'any',
    minSliceSize: 20,
    casesPerAttack: 2,
  },
]

const levelOk = (spec: AttackSpec, value: number) => {
  const p = spec.primary_param
  return p.type === 'discrete' && p.values
    ? p.values.includes(value)
    : value >= p.min && value <= p.max
}

/** Attack của mẫu có trong catalog (level ngoài dải bị bỏ). */
function resolve(template: ProtocolTemplate, specs: AttackSpec[]): TemplateAttack[] {
  return template.attacks.flatMap((a) => {
    const spec = specs.find((s) => s.name === a.name)
    if (!spec) return []
    const levels = a.levels.filter((l) => levelOk(spec, l))
    if (levels.length === 0) return []
    const criterion = a.criterion && levels.includes(a.criterion.level) ? a.criterion : undefined
    return [{ ...a, levels, criterion }]
  })
}

/** Mẫu dùng được với catalog hiện tại; mẫu thiếu attack bị ẩn. */
export function availableTemplates(specs: AttackSpec[]): ProtocolTemplate[] {
  return PROTOCOL_TEMPLATES.filter((t) => {
    const found = resolve(t, specs)
    return t.need === 'all' ? found.length === t.attacks.length : found.length > 0
  })
}

/** Ngày dạng `2026-10-05` để tên gợi ý không trùng giữa các lần tạo. */
export function dateTag(today: Date): string {
  return today.toISOString().slice(0, 10)
}

/** Form điền đủ theo mẫu: tên gợi ý, mục đích, attack, tiêu chí, slice, số case. */
export function formFromTemplate(
  template: ProtocolTemplate,
  specs: AttackSpec[],
  today = new Date(),
): ProtocolForm {
  const attacks = resolve(template, specs)
  return {
    name: `${template.name} ${dateTag(today)}`,
    description: template.purpose,
    minSliceSize: String(template.minSliceSize),
    casesPerAttack: String(template.casesPerAttack),
    forbidDirty: true,
    attacks: attacks.map((a) => ({
      ...EMPTY_ATTACK,
      name: a.name,
      levels: formatLevels(a.levels),
    })),
    criteria: attacks.flatMap((a) =>
      a.criterion
        ? [
            {
              ...EMPTY_CRITERION,
              attackName: a.name,
              level: String(a.criterion.level),
              threshold: String(a.criterion.maxDropPct),
            },
          ]
        : [],
    ),
  }
}

/**
 * Form mặc định khi không chọn mẫu: mẫu đầu tiên dùng được; catalog không khớp mẫu nào thì một
 * attack đầu catalog với level khuyên dùng, không để ô trống.
 */
export function defaultForm(specs: AttackSpec[], today = new Date()): ProtocolForm {
  const first = availableTemplates(specs)[0]
  if (first) return formFromTemplate(first, specs, today)
  const spec = specs[0]
  const attack = spec ? attackRowFor(spec) : { ...EMPTY_ATTACK }
  return {
    name: '',
    description: '',
    minSliceSize: '20',
    casesPerAttack: '3',
    forbidDirty: true,
    attacks: [attack],
    criteria: spec ? [criterionFor(attack)] : [{ ...EMPTY_CRITERION }],
  }
}

/** Ba level khuyên dùng ở giữa dải (ví dụ eps 2, 4, 8) cho attack mới thêm. */
export function startLevels(spec: AttackSpec): number[] {
  const all = recommendedLevels(spec)
  if (all.length <= 3) return all
  const start = Math.max(0, Math.floor((all.length - 3) / 2))
  return all.slice(start, start + 3)
}

/** Dòng attack mặc định cho một spec: quét lưới với level khuyên dùng; dải tìm ngưỡng = dải spec. */
export function attackRowFor(spec: AttackSpec): AttackRow {
  const { min, max } = spec.primary_param
  return {
    ...EMPTY_ATTACK,
    name: spec.name,
    levels: formatLevels(startLevels(spec)),
    lo: String(min),
    hi: String(max),
    maxTol: String(Number(((max - min) / 32).toFixed(4))),
  }
}

/** Tiêu chí mặc định cho một attack: quét lưới → mức sụt 40% ở level giữa; tìm ngưỡng → điểm gãy
 * ở giữa dải. */
export function criterionFor(attack: AttackRow): CriterionRow {
  if (attack.mode === 'search') {
    const lo = Number(attack.lo)
    const hi = Number(attack.hi)
    const mid = Number.isFinite(lo) && Number.isFinite(hi) ? Number(((lo + hi) / 2).toFixed(4)) : ''
    return {
      ...EMPTY_CRITERION,
      kind: 'min_breaking_point',
      attackName: attack.name,
      level: String(mid),
    }
  }
  const levels = parseLevels(attack.levels)
  const level = levels[Math.floor(levels.length / 2)]
  return {
    ...EMPTY_CRITERION,
    attackName: attack.name,
    level: level === undefined ? '' : String(level),
    threshold: '40',
  }
}
