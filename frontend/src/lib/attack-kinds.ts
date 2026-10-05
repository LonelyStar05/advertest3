import {
  CloudFog,
  CloudRain,
  Contrast,
  Crosshair,
  type LucideIcon,
  Repeat,
  Snowflake,
  SquareDashed,
  Sticker,
  Sun,
  ThermometerSnowflake,
  Wind,
  Sparkles,
  Zap,
  Shuffle,
} from 'lucide-react'

import type { AttackKind, AttackSpec, PrimaryParam } from '@/contracts/api'

/** Tên nhóm attack (requirements.md Phase 6, Frontend: wizard bước 4 và bảng xếp hạng). */
export const ATTACK_KIND_LABEL: Record<AttackKind, string> = {
  attack: 'Tấn công',
  corruption: 'Biến đổi điều kiện',
  occlusion: 'Che khuất',
}

/** Thứ tự nhóm cố định. */
export const ATTACK_KINDS: AttackKind[] = ['attack', 'corruption', 'occlusion']

/**
 * Một câu đời thường cho từng attack trong catalog (theo tên spec), để người mới hiểu attack đó
 * mô phỏng điều gì ngoài đời. Spec mới chưa có câu mô tả thì chỉ hiện tên.
 */
export const ATTACK_PLAIN: Record<string, string> = {
  fgsm: 'Thêm nhiễu rất nhỏ theo một bước gradient. Nhanh, hợp để dò điểm yếu đầu tiên.',
  pgd_linf: 'Nhiễu tinh vi lặp nhiều bước, mỗi điểm ảnh lệch không quá eps. Mạnh hơn FGSM.',
  pgd_l2: 'Như PGD nhưng giới hạn tổng độ lệch của cả ảnh, nhiễu trải đều hơn.',
  adv_patch: 'Một miếng dán in được, đặt lên ảnh để đánh lừa model. Gần với tấn công ngoài đời.',
  contrast: 'Ảnh mất tương phản như trời âm u hoặc ngược sáng.',
  fog: 'Sương mù làm mờ vật ở xa.',
  frost: 'Kính camera bám sương giá.',
  motion_blur: 'Ảnh nhòe do xe hoặc camera đang chuyển động.',
  snow: 'Tuyết rơi che một phần khung hình.',
  bbox_occlusion: 'Một vật che khuất một phần đối tượng, như người đứng sau cột đèn.',
  rain: 'Vệt mưa và giọt nước trên ống kính.',
  brightness: 'Ảnh quá sáng do nắng gắt hoặc đèn pha.',
  gaussian_noise: 'Nhiễu hạt của cảm biến khi thiếu sáng.',
}

/** Cách thuật toán hoạt động và rủi ro ngoài đời mà nó mô phỏng (1–2 câu mỗi ý). */
export interface AttackExplain {
  how: string
  risk: string
}

export const ATTACK_EXPLAIN: Record<string, AttackExplain> = {
  fgsm: {
    how: 'Tính gradient của hàm mất mát theo ảnh một lần, rồi đẩy mỗi điểm ảnh lệch đúng eps theo hướng làm model sai nhiều nhất.',
    risk: 'Người biết rõ model chèn nhiễu mắt thường không thấy vào luồng ảnh camera.',
  },
  pgd_linf: {
    how: 'Lặp 10 bước FGSM nhỏ (mỗi bước eps/4); sau mỗi bước kéo ảnh về lại trong khoảng ±eps quanh ảnh gốc.',
    risk: 'Kẻ tấn công có thời gian tối ưu nhiễu: kịch bản xấu nhất với nhiễu nhỏ trên từng điểm ảnh.',
  },
  pgd_l2: {
    how: 'Như PGD L∞ nhưng giới hạn độ dài (chuẩn L2) của cả vector nhiễu, nên nhiễu có thể dồn vào vài vùng ảnh.',
    risk: 'Nhiễu tập trung cục bộ, giống vết bẩn hay phản chiếu được tính toán sẵn.',
  },
  adv_patch: {
    how: 'Huấn luyện một miếng vuông (RobustDPatch) trên slice huấn luyện riêng để model sai nhiều nhất, có thay đổi độ sáng, rồi dán vào giữa ảnh.',
    risk: 'Miếng dán in ra giấy dán lên biển báo, thân xe hay áo: tấn công vật lý ngoài đời.',
  },
  fog: {
    how: 'Phủ một lớp sương sinh từ nhiễu fractal lên ảnh; mức severity càng cao lớp sương càng dày và ảnh càng mất tương phản.',
    risk: 'Sương mù, mưa phùn làm mờ người và xe ở xa.',
  },
  snow: {
    how: 'Vẽ các lớp hạt tuyết bị nhòe theo hướng rơi và làm sáng ảnh, tăng mật độ theo severity.',
    risk: 'Tuyết rơi, bụi bay che khuất một phần khung hình.',
  },
  frost: {
    how: 'Trộn ảnh với ảnh chụp lớp băng giá thật; severity càng cao lớp băng càng đậm.',
    risk: 'Kính chắn gió hoặc ống kính đọng sương, đóng băng.',
  },
  motion_blur: {
    how: 'Làm nhòe ảnh theo một hướng ngẫu nhiên, độ dài vệt nhòe tăng theo severity.',
    risk: 'Xe chạy nhanh, camera rung, tốc độ chụp chậm khi trời tối.',
  },
  contrast: {
    how: 'Kéo mọi điểm ảnh về độ sáng trung bình, thu hẹp khoảng sáng tối theo severity.',
    risk: 'Trời âm u, ngược sáng, đèn pha chói.',
  },
  bbox_occlusion: {
    how: 'Đặt một hình chữ nhật xám cùng tỉ lệ với box, ở vị trí ngẫu nhiên bên trong mỗi object, che đúng tỉ lệ diện tích đã chọn.',
    risk: 'Người bị cột đèn, xe khác hay biển quảng cáo che một phần.',
  },
  rain: {
    how: 'Vẽ các vệt mưa xiên và làm mờ nhẹ ảnh, mật độ tăng theo severity.',
    risk: 'Mưa lớn, giọt nước bám trên ống kính.',
  },
  brightness: {
    how: 'Tăng độ sáng toàn ảnh trong không gian màu HSV theo severity.',
    risk: 'Nắng gắt, đèn pha chiếu thẳng vào camera.',
  },
  gaussian_noise: {
    how: 'Cộng nhiễu ngẫu nhiên phân phối chuẩn vào từng điểm ảnh, độ lệch chuẩn tăng theo severity.',
    risk: 'Cảm biến bị nhiễu hạt khi chụp thiếu sáng.',
  },
}

/** Ô biểu tượng pastel của từng attack (class `tile` với `--tile-bg`/`--tile-fg`). */
export interface AttackLook {
  icon: LucideIcon
  tile: string
}

const KIND_LOOK: Record<AttackKind, AttackLook> = {
  attack: { icon: Zap, tile: '[--tile-bg:#fce7f3] [--tile-fg:#be185d]' },
  corruption: { icon: CloudFog, tile: '[--tile-bg:#e0f2fe] [--tile-fg:#0369a1]' },
  occlusion: { icon: SquareDashed, tile: '[--tile-bg:#ffedd5] [--tile-fg:#c2410c]' },
}

const NAME_ICON: Record<string, LucideIcon> = {
  fgsm: Zap,
  pgd_linf: Repeat,
  pgd_l2: Crosshair,
  adv_patch: Sticker,
  fog: CloudFog,
  snow: Snowflake,
  frost: ThermometerSnowflake,
  motion_blur: Wind,
  contrast: Contrast,
  bbox_occlusion: SquareDashed,
  rain: CloudRain,
  brightness: Sun,
  gaussian_noise: Sparkles,
}

export function attackLook(spec: Pick<AttackSpec, 'name' | 'kind'>): AttackLook {
  const base = KIND_LOOK[spec.kind] ?? { icon: Shuffle, tile: '' }
  return { icon: NAME_ICON[spec.name] ?? base.icon, tile: base.tile }
}

/**
 * Level khuyên dùng cho protocol và wizard theo tên spec (giá trị trong dải của seed catalog).
 * Spec không có trong bảng: lấy theo dải (`fallbackLevels`).
 */
export const RECOMMENDED_LEVELS: Record<string, number[]> = {
  fgsm: [1, 2, 4, 8, 16],
  pgd_linf: [1, 2, 4, 8, 16],
  pgd_l2: [0.25, 0.5, 1, 2, 4],
  adv_patch: [0.05, 0.1, 0.15, 0.25],
  bbox_occlusion: [0.1, 0.2, 0.3, 0.5, 0.7],
}

function inRange(param: PrimaryParam, value: number): boolean {
  if (param.type === 'discrete' && param.values) return param.values.includes(value)
  return value >= param.min && value <= param.max
}

/** Rời rạc: mọi giá trị; liên tục: 5 điểm chia đều (0, max] làm tròn. */
function fallbackLevels(param: PrimaryParam): number[] {
  if (param.type === 'discrete' && param.values) return [...param.values]
  return [1, 2, 3, 4, 5]
    .map((k) => Number((param.min + ((param.max - param.min) * k) / 5).toFixed(3)))
    .filter((v) => v > param.min)
}

export function recommendedLevels(spec: Pick<AttackSpec, 'name' | 'primary_param'>): number[] {
  const param = spec.primary_param
  const known = (RECOMMENDED_LEVELS[spec.name] ?? []).filter((v) => inRange(param, v))
  return known.length > 0 ? known : fallbackLevels(param)
}

/** Một câu giải thích tham số chính (level) của attack nghĩa là gì. */
export function paramPlain(param: PrimaryParam): string {
  if (param.name === 'eps' && param.unit === '1/255')
    return 'eps: độ lệch tối đa của mỗi điểm ảnh, đơn vị 1/255 (eps 8 ≈ 3% độ sáng).'
  if (param.name === 'eps')
    return `eps: độ dài tối đa của nhiễu trên cả ảnh (${param.unit || 'không đơn vị'}).`
  if (param.name === 'severity') return 'severity: mức 1 (nhẹ) đến 5 (rất nặng).'
  if (param.name === 'occlusion_ratio')
    return 'occlusion_ratio: phần diện tích mỗi object bị che (0.3 = 30%).'
  if (param.name === 'area_ratio') return 'area_ratio: phần diện tích ảnh miếng dán chiếm.'
  return `${param.name}${param.unit ? ` (${param.unit})` : ''}`
}
