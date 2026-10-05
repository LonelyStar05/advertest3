/** Mẫu protocol và giá trị mặc định (góp ý mentor: cho chọn thay vì gõ). */
import { describe, expect, it } from 'vitest'

import type { AttackSpec } from '@/contracts/api'
import { ATTACK_EXPLAIN, recommendedLevels } from '@/lib/attack-kinds'

import { buildProtocol } from './form'
import {
  attackRowFor,
  availableTemplates,
  criterionFor,
  defaultForm,
  formFromTemplate,
  PROTOCOL_TEMPLATES,
  startLevels,
} from './templates'

const seedFiles = import.meta.glob<AttackSpec[]>('../../../../contracts/seeds/attack_specs.json', {
  eager: true,
  import: 'default',
})
const specs = Object.values(seedFiles)[0]
const today = new Date('2026-10-05T08:00:00Z')

describe('mẫu protocol', () => {
  it('mọi mẫu dùng được với catalog seed đều dựng ra body hợp lệ', () => {
    const list = availableTemplates(specs)
    expect(list.map((t) => t.id)).toEqual(['quick', 'safety', 'weather'])
    for (const t of list) {
      const result = buildProtocol(formFromTemplate(t, specs, today), specs)
      expect(result.ok).toBe(true)
    }
  })

  it('Kiểm nhanh: FGSM 2, 4, 8; sụt tối đa 50% ở 8; slice 5; 2 case', () => {
    const quick = PROTOCOL_TEMPLATES[0]
    const result = buildProtocol(formFromTemplate(quick, specs, today), specs)
    if (!result.ok) throw new Error('mẫu không hợp lệ')
    expect(result.name).toBe('Kiểm nhanh FGSM 2026-10-05')
    expect(result.body.required_attacks[0].grid?.levels).toEqual([2, 4, 8])
    expect(result.body.pass_criteria[0]).toMatchObject({ level: 8, threshold: 0.5 })
    expect(result.body.min_slice_size).toBe(5)
    expect(result.body.cases_to_review_per_attack).toBe(2)
  })

  it('Thời tiết xấu chỉ dùng attack có trong catalog (không có rain); ẩn khi không có attack nào', () => {
    const weather = PROTOCOL_TEMPLATES.find((t) => t.id === 'weather')
    if (!weather) throw new Error('thiếu mẫu')
    const form = formFromTemplate(weather, specs, today)
    expect(form.attacks.map((a) => a.name)).toEqual(['fog', 'snow', 'frost'])
    const noWeather = specs.filter((s) => s.kind !== 'corruption')
    expect(availableTemplates(noWeather).map((t) => t.id)).toEqual(['quick', 'safety'])
    expect(availableTemplates(specs.filter((s) => s.name !== 'pgd_linf')).map((t) => t.id)).toEqual(
      ['quick', 'weather'],
    )
  })

  it('form mặc định không để trống; catalog lạ vẫn có attack và tiêu chí hợp lệ', () => {
    expect(defaultForm(specs, today).attacks[0].name).toBe('fgsm')
    const odd = specs.filter((s) => s.name === 'bbox_occlusion')
    const form = defaultForm(odd, today)
    expect(form.attacks[0].levels).not.toBe('')
    const result = buildProtocol({ ...form, name: 'P', description: 'D' }, odd)
    expect(result.ok).toBe(true)
  })

  it('attack mới: level khuyên dùng ở giữa dải, dải tìm ngưỡng theo spec, tiêu chí theo chế độ', () => {
    const fgsm = specs.find((s) => s.name === 'fgsm')
    if (!fgsm) throw new Error('thiếu fgsm')
    expect(recommendedLevels(fgsm)).toEqual([1, 2, 4, 8, 16])
    expect(startLevels(fgsm)).toEqual([2, 4, 8])
    const row = attackRowFor(fgsm)
    expect(row).toMatchObject({ levels: '2, 4, 8', lo: '0', hi: '32' })
    expect(criterionFor(row)).toMatchObject({ kind: 'max_drop_at_level', level: '4' })
    const search = { ...row, mode: 'search' as const }
    expect(criterionFor(search)).toMatchObject({ kind: 'min_breaking_point', level: '16' })
    const result = buildProtocol(
      { ...defaultForm(specs), attacks: [search], criteria: [criterionFor(search)] },
      specs,
    )
    expect(result.ok).toBe(true)
  })

  it('mọi attack trong catalog có giải thích cách hoạt động và rủi ro mô phỏng', () => {
    for (const s of specs) {
      expect(ATTACK_EXPLAIN[s.name]?.how).toBeTruthy()
      expect(ATTACK_EXPLAIN[s.name]?.risk).toBeTruthy()
      expect(recommendedLevels(s).length).toBeGreaterThan(0)
    }
  })
})
