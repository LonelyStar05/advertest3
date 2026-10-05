import { describe, expect, it } from 'vitest'

import { listMocks } from '@/api/mocks'
import type { ExperimentDetail, RunView } from '@/contracts/api'
import { failureCasesKey } from '@/features/experiments/api'
import { FailureCasesTab, ResultsTab } from '@/features/experiments/tabs'
import { render } from '@/test-utils'

import { casesHref } from './insights'
import { WeaknessOverview } from './WeaknessOverview'

const detail = listMocks<ExperimentDetail>('experiment_detail').find((d) =>
  d.id.startsWith('c22f67c0'),
)
if (!detail) throw new Error('Thiếu mock experiment completed')
const runs = listMocks<RunView>('run_view').filter((r) => r.experiment_id === detail.id)
const grid = new Set(detail.config.attacks.map((a) => a.attack_spec_id))
const pgd = runs.find((r) => r.attack_spec.name === 'pgd_linf' && r.level === 4)
if (!pgd) throw new Error('Thiếu run PGD 4')

const attr = (value: string) => value.replaceAll('&', '&amp;')

describe('phần điểm yếu ở đầu tab Kết quả', () => {
  const html = render(<WeaknessOverview experiment={detail} runs={runs} heatmapAttackIds={grid} />)

  it('kết luận nhanh, thẻ mức nghiêm trọng và ma trận có tiêu đề, cách đọc, chú giải', () => {
    expect(html).toContain('Kết luận nhanh')
    expect(html).toContain('Model yếu nhất với PGD (L∞)')
    expect(html).toContain('Mức nghiêm trọng theo attack')
    expect(html).toContain('Nghiêm trọng')
    expect(html).toContain('Ma trận điểm yếu')
    expect(html).toContain('Cách đọc:')
    expect(html).toContain('Mức eps (x/255)')
    expect(html).toContain('Thang màu mức sụt mAP@0.5')
  })

  it('ô ma trận và câu kết luận link tới failure case đã lọc', () => {
    expect(html).toContain(`href="/${attr(casesHref(pgd.attack_spec_id, 4))}"`)
    expect(html).toMatch(/aria-label="Với PGD \(L∞\) ở mức 4\/255, mAP@0.5 giảm 96%/)
    // Thẻ có ảnh hỏng thì có link "Xem ảnh hỏng (n)".
    expect(html).toContain(`Xem ảnh hỏng (${String(pgd.failure_case_ids.length)})`)
  })

  it('phần tử bấm được cao tối thiểu 44px', () => {
    const links = [...html.matchAll(/<a [^>]*class="([^"]*)"/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(3)
    for (const cls of links) expect(cls).toContain('min-h-11')
  })

  it('ResultsTab đặt phần điểm yếu trước xếp hạng và có câu hướng dẫn đọc biểu đồ', () => {
    const catalog = listMocks<ExperimentDetail>('experiment_detail').find(
      (d) => (d.attack_ranking ?? []).length > 0,
    )
    if (!catalog) throw new Error('Thiếu mock có xếp hạng')
    const catalogRuns = listMocks<RunView>('run_view').filter((r) => r.experiment_id === catalog.id)
    const tab = render(<ResultsTab experiment={catalog} runs={catalogRuns} />)
    expect(tab.indexOf('weakness-overview')).toBeGreaterThan(-1)
    expect(tab.indexOf('weakness-overview')).toBeLessThan(tab.indexOf('Xếp hạng attack'))
    expect(tab).toContain('Cột càng dài, attack càng làm model sụt nhiều')
    expect(tab).toContain('Đường cong theo mức nhiễu')
  })

  it('chưa có run nào thì không hiện', () => {
    expect(render(<WeaknessOverview experiment={detail} runs={[]} heatmapAttackIds={grid} />)).toBe(
      '',
    )
  })
})

describe('tab Failure case lọc theo URL', () => {
  const data: [readonly unknown[], unknown][] = runs.map((r) => [failureCasesKey(r.run_id), []])

  it('lọc theo attack và level; có nút bỏ lọc mức', () => {
    const html = render(
      <FailureCasesTab runs={runs} />,
      `/experiments/x${casesHref(pgd.attack_spec_id, 4)}`,
      undefined,
      data,
    )
    expect(html).toContain('Lọc failure case theo attack')
    expect(html).toContain('chỉ mức')
    expect(html).toContain('eps 4/255')
    expect(html).toContain('Xem mọi mức')
    expect(html).toMatch(/aria-current="true"[^>]*>PGD \(L∞\)</)
  })

  it('lọc không khớp run nào thì nói rõ', () => {
    const html = render(
      <FailureCasesTab runs={runs} />,
      `/experiments/x${casesHref(pgd.attack_spec_id, 99)}`,
      undefined,
      data,
    )
    expect(html).toContain('Không có ảnh hỏng nào được lưu cho lựa chọn này')
  })
})
