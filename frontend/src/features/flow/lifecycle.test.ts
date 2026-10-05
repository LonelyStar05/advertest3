/** Thanh vòng đời trên trang chi tiết experiment và ý nghĩa quyết định review. */
import { describe, expect, it } from 'vitest'

import { listMocks } from '@/api/mocks'
import type { ExperimentDetail, ExperimentStatus } from '@/contracts/api'

import { DECISION_MEANING, decisionOf } from './approval'
import { lifecycle } from './lifecycle'

const mocks = listMocks<ExperimentDetail>('experiment_detail')
const byStatus = (status: ExperimentStatus) => {
  const e = mocks.find((m) => m.status === status)
  if (!e) throw new Error(`thiếu mock ${status}`)
  return e
}
const states = (e: ExperimentDetail) => lifecycle(e).map((s) => s.state)
const current = (e: ExperimentDetail) => lifecycle(e).find((s) => s.state === 'current')

describe('vòng đời experiment', () => {
  it('đang chạy: Cấu hình xong, Chạy hiện tại, xem được kết quả tạm', () => {
    const e = byStatus('running')
    expect(states(e)).toEqual(['done', 'current', 'todo', 'todo', 'todo', 'todo'])
    expect(current(e)?.note).toBe('Đang chạy')
    expect(lifecycle(e).find((s) => s.id === 'results')?.to).toBeNull()
  })

  it('hoàn thành: bước hiện tại là Xem kết quả, liên kết tới tab kết quả', () => {
    const e = byStatus('completed')
    expect(current(e)).toMatchObject({ id: 'results', to: '?tab=results' })
  })

  it('đang review: Gửi duyệt đã xong và bấm được tới tab Review', () => {
    const e = byStatus('in_review')
    const stages = lifecycle(e)
    expect(stages.find((s) => s.id === 'submit')).toMatchObject({
      state: 'done',
      to: '?tab=review',
    })
    expect(current(e)?.id).toBe('review')
  })

  it('yêu cầu sửa / từ chối: dừng ở Review với sắc thái riêng, Report không bấm được', () => {
    for (const [status, tone] of [
      ['changes_requested', 'warning'],
      ['rejected', 'danger'],
    ] as const) {
      const stages = lifecycle(byStatus(status))
      expect(stages.find((s) => s.id === 'review')).toMatchObject({ state: 'current', tone })
      expect(stages.find((s) => s.id === 'report')).toMatchObject({ state: 'stopped', to: null })
    }
  })

  it('đã chấp nhận và report sẵn sàng: cả luồng xong, Report mở trang report', () => {
    const e = mocks.find((m) => m.status === 'approved' && m.report?.status === 'ready')
    if (!e?.report) throw new Error('thiếu mock')
    const stages = lifecycle(e)
    expect(stages.every((s) => s.state === 'done')).toBe(true)
    expect(stages.at(-1)?.to).toBe(`/reports/${e.report.id}`)
  })
})

describe('ý nghĩa quyết định', () => {
  it('ba quyết định, chấp nhận nói rõ không có nghĩa là model đạt', () => {
    expect(DECISION_MEANING.map((m) => m.title)).toEqual(['Chấp nhận', 'Yêu cầu sửa', 'Từ chối'])
    expect(DECISION_MEANING[0].caveat).toMatch(/Không có nghĩa là model đạt/)
    expect(DECISION_MEANING[2].next).toMatch(/Không có report/)
    expect(decisionOf('approved')).toBe('approve')
    expect(decisionOf('in_review')).toBeNull()
  })
})
