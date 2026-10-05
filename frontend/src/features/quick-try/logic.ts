/** Logic thuần của trang Thử nhanh: chọn mặc định, câu tóm tắt, màu khung (test được). */
import type { AttackSpecView, ModelSummary, QuickTryResult } from '@/contracts/api'
import { recommendedLevels } from '@/lib/attack-kinds'

/** Attack cần huấn luyện (miếng dán) không thử nhanh được. */
export function quickTryable(specs: readonly AttackSpecView[]): AttackSpecView[] {
  return specs.filter((s) => !s.requires_training)
}

/** Mức gợi ý cho chip: ưu tiên mô tả từ catalog, sau đó bảng khuyên dùng của giao diện. */
export function levelChoices(spec: AttackSpecView): number[] {
  const fromCatalog = spec.display?.recommended_levels ?? []
  return fromCatalog.length > 0 ? [...fromCatalog] : recommendedLevels(spec)
}

/** Mức chọn sẵn: `quick_try_level` của catalog, không có thì mức giữa của danh sách gợi ý. */
export function defaultLevel(spec: AttackSpecView): number {
  const preset = spec.display?.quick_try_level
  if (typeof preset === 'number') return preset
  const choices = levelChoices(spec)
  return choices[Math.floor((choices.length - 1) / 2)] ?? spec.primary_param.min
}

/** Model mặc định: model đầu tiên hỗ trợ gradient (để FGSM/PGD chạy được), không thì model đầu. */
export function defaultModel(models: readonly ModelSummary[]): ModelSummary | undefined {
  return models.find((m) => m.supports_gradients) ?? models[0]
}

/** Attack mặc định: FGSM nếu có, không thì attack đầu tiên thử được. */
export function defaultAttack(specs: readonly AttackSpecView[]): AttackSpecView | undefined {
  const usable = quickTryable(specs)
  return usable.find((s) => s.name === 'fgsm') ?? usable[0]
}

export function attackTitle(spec: Pick<AttackSpecView, 'name' | 'display'>): string {
  return spec.display?.title_vi ?? spec.name
}

export function formatLevel(level: number, unit: string): string {
  const n = Number.isInteger(level) ? String(level) : String(Number(level.toFixed(3)))
  if (unit === '1/255') return `${n}/255`
  return unit ? `${n} ${unit}` : n
}

/** Một câu kết luận dễ hiểu cho kết quả thử. */
export function resultSentence(r: QuickTryResult, title: string): string {
  const level = formatLevel(r.level, r.unit)
  const { clean_count: clean, missed_count: missed, new_count: added } = r.summary
  if (clean === 0 && added === 0)
    return `Model không nhận ra vật thể nào trong ảnh này, kể cả trước và sau ${title} ở mức ${level}.`
  if (missed === 0 && added === 0)
    return `${title} ở mức ${level} chưa đánh lừa được model: vẫn nhận ra đủ ${clean} vật thể, không thấy thêm vật thể ảo.`
  const parts: string[] = []
  if (missed > 0) parts.push(`bỏ sót ${missed}/${clean} vật thể`)
  if (added > 0) parts.push(`thấy thêm ${added} vật thể không có thật`)
  return `${title} ở mức ${level} làm model ${parts.join(' và ')}.`
}

export type BoxTone = 'kept' | 'missed' | 'new'

/** Ảnh sạch: box còn thấy sau tấn công là `kept`, mất là `missed`. Ảnh tấn công: khớp `kept`, mới `new`. */
export function boxTone(side: 'clean' | 'attacked', matched: boolean): BoxTone {
  if (matched) return 'kept'
  return side === 'clean' ? 'missed' : 'new'
}

export const TONE_STYLE: Record<BoxTone, { stroke: string; label: string; dash?: string }> = {
  kept: { stroke: '#0284c7', label: 'Vẫn nhận ra' },
  missed: { stroke: '#dc2626', label: 'Bị bỏ sót sau tấn công', dash: '10 6' },
  new: { stroke: '#d97706', label: 'Phát hiện sai mới' },
}

/** Đọc file người dùng chọn thành data URL; từ chối file không phải PNG/JPEG hoặc quá 6 MB. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

export function uploadProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return 'Chỉ nhận ảnh PNG hoặc JPEG.'
  if (file.size > MAX_UPLOAD_BYTES) return 'Ảnh lớn hơn 6 MB; hãy chọn ảnh nhỏ hơn.'
  return null
}
