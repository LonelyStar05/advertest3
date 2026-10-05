import { describe, expect, it } from 'vitest'

import { listMocks } from '@/api/mocks'
import type { ExperimentDetail, RunView } from '@/contracts/api'

import {
  attackSummaries,
  axisTitle,
  casesHref,
  describeCell,
  formatDrop,
  heatmapGroups,
  heatStop,
  HEAT_STOPS,
  levelText,
  matchesFilter,
  quickInsights,
  readCasesFilter,
  severityOf,
  SEVERITY_THRESHOLDS,
  worstClass,
} from './insights'

const details = listMocks<ExperimentDetail>('experiment_detail')
const allRuns = listMocks<RunView>('run_view')
const completed = details.find((d) => d.id.startsWith('c22f67c0'))
const catalog = details.find((d) => d.id.startsWith('9ec0fa7e'))
if (!completed || !catalog) throw new Error('Thiếu mock experiment completed/full_catalog')
const completedRuns = allRuns.filter((r) => r.experiment_id === completed.id)
const catalogRuns = allRuns.filter((r) => r.experiment_id === catalog.id)

/** Run giả lập tối thiểu (chỉ các trường phần điểm yếu đọc). */
function run(
  attack: string,
  level: number,
  drop: number | null,
  extra: Partial<RunView> = {},
): RunView {
  const base = completedRuns[0]
  return {
    ...base,
    run_id: `${attack}-${String(level)}`,
    attack_spec_id: `id-${attack}`,
    level,
    status: 'completed',
    status_reason: null,
    scope: 'full',
    failure_case_ids: [],
    attack_spec: { ...base.attack_spec, name: attack, param_name: 'eps', param_unit: '1/255' },
    metrics:
      drop === null
        ? null
        : {
            clean: { map50: 0.8, map50_95: 0.5 },
            attacked: { map50: 0.8 * (1 - drop), map50_95: 0.3 },
            relative_drop: drop,
            absolute_drop: 0.8 * drop,
            attack_success_rate: drop,
            per_class: null,
            partial: false,
          },
    ...extra,
  }
}

const experiment: ExperimentDetail = { ...completed, search_results: [] }

describe('mức nghiêm trọng', () => {
  it('ngưỡng là hằng số: < 10% ổn, 10–30% đáng lo, ≥ 30% nghiêm trọng', () => {
    expect(SEVERITY_THRESHOLDS).toEqual({ warn: 0.1, severe: 0.3 })
    expect(severityOf(null)).toBeNull()
    expect(severityOf(-0.02)).toBe('ok')
    expect(severityOf(0.099)).toBe('ok')
    expect(severityOf(0.1)).toBe('warn')
    expect(severityOf(0.299)).toBe('warn')
    expect(severityOf(0.3)).toBe('severe')
  })

  it('định dạng mức sụt và level', () => {
    expect(formatDrop(0.567)).toBe('57%')
    expect(formatDrop(-0.021)).toBe('−2%')
    expect(levelText(4, 'eps', '1/255')).toBe('eps 4/255')
    expect(levelText(3, 'severity', 'severity')).toBe('severity 3')
    expect(levelText(0.25, 'area_ratio', 'ratio')).toBe('area_ratio 0.25 ratio')
    expect(axisTitle('eps', '1/255')).toBe('Mức eps (x/255)')
    expect(axisTitle('severity', 'severity')).toBe('Mức severity')
  })
})

describe('link và bộ lọc failure case', () => {
  it('casesHref tạo search param đọc lại được', () => {
    const href = casesHref('abc', 4)
    expect(href).toBe('?tab=cases&attack=abc&level=4')
    expect(readCasesFilter(new URLSearchParams(href))).toEqual({ attack: 'abc', level: 4 })
    expect(readCasesFilter(new URLSearchParams('?tab=cases&level=x'))).toEqual({
      attack: null,
      level: null,
    })
  })

  it('matchesFilter so attack và level', () => {
    const r = { attack_spec_id: 'a', level: 4 }
    expect(matchesFilter(r, { attack: null, level: null })).toBe(true)
    expect(matchesFilter(r, { attack: 'a', level: null })).toBe(true)
    expect(matchesFilter(r, { attack: 'a', level: 4 })).toBe(true)
    expect(matchesFilter(r, { attack: 'a', level: 8 })).toBe(false)
    expect(matchesFilter(r, { attack: 'b', level: null })).toBe(false)
  })
})

describe('thẻ theo attack', () => {
  it('xếp nặng nhất trước, lấy level sụt mạnh nhất và level vượt 30% đầu tiên', () => {
    const runs = [
      run('fgsm', 2, 0.03),
      run('fgsm', 4, 0.12),
      run('pgd_linf', 2, 0.2),
      run('pgd_linf', 4, 0.57, { failure_case_ids: ['c1', 'c2'] }),
      run('pgd_linf', 8, 0.4),
      run('snow', 1, null),
    ]
    const cards = attackSummaries(experiment, runs)
    expect(cards.map((c) => c.name)).toEqual(['pgd_linf', 'fgsm', 'snow'])
    const [pgd, fgsm, snow] = cards
    expect(pgd.worst).toEqual({ level: 4, drop: 0.57, partial: false })
    expect(pgd.severity).toBe('severe')
    expect(pgd.breakpoint?.value).toBe('eps 4/255')
    expect(pgd.cases).toBe(2)
    expect(pgd.label).toBe('PGD (L∞)')
    expect(fgsm.severity).toBe('warn')
    expect(fgsm.breakpoint).toBeNull()
    expect(snow.worst).toBeNull()
    expect(snow.severity).toBeNull()
  })

  it('attack tìm ngưỡng dùng điểm gãy của backend, bỏ run tập con', () => {
    const search = details.find((d) => d.id.startsWith('872ccaa0') && d.status === 'completed')
    if (!search) throw new Error('Thiếu mock search_completed')
    const runs = allRuns.filter((r) => r.experiment_id === search.id)
    expect(runs.some((r) => r.scope === 'subset')).toBe(true)
    // Run tập con không tạo thẻ.
    expect(attackSummaries(search, runs)).toEqual([])
    const found = (search.search_results ?? []).find((r) => r.status === 'found')
    if (!found || found.breaking_point == null) throw new Error('Thiếu kết quả found')
    const cards = attackSummaries(search, [
      run('pgd_linf', 2, 0.25, { attack_spec_id: found.attack_spec_id }),
    ])
    expect(cards[0].breakpoint?.label).toBe('Điểm gãy theo ngưỡng protocol')
    expect(cards[0].breakpoint?.level).toBe(found.breaking_point)
  })

  it('mock completed: PGD nặng nhất, thẻ đủ attack có run', () => {
    const cards = attackSummaries(completed, completedRuns)
    expect(cards[0].name).toBe('pgd_linf')
    expect(cards[0].severity).toBe('severe')
    expect(new Set(cards.map((c) => c.name))).toEqual(new Set(['fgsm', 'pgd_linf', 'pgd_l2']))
  })
})

describe('kết luận nhanh', () => {
  it('câu yếu nhất, câu ít ảnh hưởng và câu đếm; link tới case đã lọc', () => {
    const runs = [
      run('fgsm', 2, 0.03),
      run('fgsm', 4, 0.12),
      run('pgd_linf', 4, 0.57),
      run('pgd_linf', 2, 0.05),
    ]
    const sentences = quickInsights(experiment, runs)
    expect(sentences.map((s) => s.id)).toEqual(['weakest', 'mild', 'count'])
    expect(sentences[0].text).toBe('Model yếu nhất với PGD (L∞): mAP@0.5 giảm 57% ở eps 4/255.')
    expect(sentences[0].href).toBe(casesHref('id-pgd_linf', 4))
    expect(sentences[0].tone).toBe('severe')
    // Ưu tiên attack khác attack yếu nhất.
    expect(sentences[1].text).toBe('FGSM ở eps 2/255 gần như không ảnh hưởng (giảm 3%).')
    expect(sentences[1].href).toBe(casesHref('id-fgsm', 2))
    expect(sentences[2].text).toBe('1/2 attack làm mAP@0.5 sụt quá 30% ở ít nhất một mức nhiễu.')
    expect(sentences[2].href).toBeNull()
    expect(sentences.length).toBeGreaterThanOrEqual(2)
    expect(sentences.length).toBeLessThanOrEqual(4)
  })

  it('có số liệu theo class: nói lớp bị ảnh hưởng nặng nhất', () => {
    const withClass = run('pgd_linf', 4, 0.5)
    if (!withClass.metrics) throw new Error('Thiếu metric')
    withClass.metrics = {
      ...withClass.metrics,
      per_class: {
        car: { clean_ap50: 0.8, attacked_ap50: 0.6 },
        person: { clean_ap50: 0.7, attacked_ap50: 0.14 },
        truck: { clean_ap50: 0, attacked_ap50: 0 },
      },
    }
    expect(worstClass({ perClass: { x: { clean: null, attacked: 1 } } } as never)).toBeNull()
    const sentences = quickInsights(experiment, [withClass])
    const cls = sentences.find((s) => s.id === 'class')
    expect(cls?.text).toBe(
      'Lớp người (person) bị ảnh hưởng nặng nhất: AP@0.5 giảm 80% với PGD (L∞) ở eps 4/255.',
    )
  })

  it('không attack nào nghiêm trọng; chưa có metric thì rỗng', () => {
    const sentences = quickInsights(experiment, [run('fgsm', 2, 0.02)])
    expect(sentences.at(-1)?.text).toBe(
      'Không attack nào làm mAP@0.5 sụt quá 30% trong dải đã chạy.',
    )
    expect(quickInsights(experiment, [run('fgsm', 2, null)])).toEqual([])
  })
})

describe('ma trận nhiệt', () => {
  it('hàng là attack (nặng nhất trước), cột là hợp các level; thiếu level là null', () => {
    const runs = [
      run('fgsm', 2, 0.03),
      run('fgsm', 4, 0.12),
      run('pgd_linf', 4, 0.57),
      run('pgd_linf', 8, null, {
        status: 'skipped',
        status_reason: { code: 'early_stop', message: 'x', trigger_run_id: 'pgd_linf-4' },
      } as Partial<RunView>),
    ]
    const [group] = heatmapGroups(runs)
    expect(group.axisTitle).toBe('Mức eps (x/255)')
    expect(group.levels).toEqual([2, 4, 8])
    expect(group.levelLabels).toEqual(['2/255', '4/255', '8/255'])
    expect(group.rows.map((r) => r.label)).toEqual(['PGD (L∞)', 'FGSM'])
    const [pgd, fgsm] = group.rows
    expect(pgd.cells[0]).toBeNull()
    expect(pgd.cells[1]?.retained).toBeCloseTo(0.43)
    expect(pgd.cells[1]?.description).toBe(
      'Với PGD (L∞) ở mức 4/255, mAP@0.5 giảm 57%, model chỉ còn nhận ra 43% so với ảnh sạch. ' +
        'Chưa có ảnh hỏng được lưu.',
    )
    expect(pgd.cells[2]?.earlyStop).toBe(true)
    expect(fgsm.cells[2]).toBeNull()
  })

  it('attack khác tham số/đơn vị nằm ở bảng riêng; lọc theo attack quét lưới', () => {
    const groups = heatmapGroups(catalogRuns)
    const titles = groups.map((g) => g.axisTitle)
    expect(titles).toContain('Mức eps (x/255)')
    expect(titles).toContain('Mức severity')
    expect(groups[0].rows.length).toBeGreaterThanOrEqual(groups[groups.length - 1].rows.length)
    expect(heatmapGroups(catalogRuns, new Set())).toEqual([])
  })

  it('mô tả ô: số liệu một phần, có ảnh hỏng, mAP tăng', () => {
    expect(
      describeCell('X', '4/255', { drop: 0.2, partial: true, earlyStop: false, cases: 3 }),
    ).toBe(
      'Với X ở mức 4/255, mAP@0.5 giảm 20%, model chỉ còn nhận ra 80% so với ảnh sạch. ' +
        'Số liệu chỉ tính trên phần ảnh đã xử lý. Có 3 ảnh hỏng để xem.',
    )
    expect(
      describeCell('X', '2/255', { drop: -0.02, partial: false, earlyStop: false, cases: 0 }),
    ).toContain('mAP@0.5 tăng 2% so với ảnh sạch')
  })

  it('thang màu: dải theo ngưỡng, chữ trắng chỉ ở nền đỏ đậm', () => {
    expect(heatStop(-0.1)).toBe(HEAT_STOPS[0])
    expect(heatStop(0.05).label).toBe('< 10%')
    expect(heatStop(0.1).label).toBe('10–20%')
    expect(heatStop(0.35).label).toBe('30–50%')
    expect(heatStop(0.57).darkText).toBe(true)
    expect(heatStop(0.95).label).toBe('≥ 70%')
    expect(HEAT_STOPS.filter((s) => s.darkText).every((s) => s.from >= 0.5)).toBe(true)
    for (const stop of HEAT_STOPS)
      expect(stop.background).toMatch(/var\(--(approved|threshold|fail)\)/)
  })
})
