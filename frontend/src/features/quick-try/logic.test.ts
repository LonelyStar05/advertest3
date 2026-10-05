import { describe, expect, it } from 'vitest'

import type { AttackSpecView, QuickTryResult } from '@/contracts/api'

import {
  boxTone,
  defaultAttack,
  defaultLevel,
  formatLevel,
  levelChoices,
  quickTryable,
  resultSentence,
  uploadProblem,
} from './logic'

const spec = (over: Partial<AttackSpecView>): AttackSpecView =>
  ({
    id: 'id',
    name: 'fgsm',
    kind: 'attack',
    requires_training: false,
    primary_param: {
      name: 'eps',
      type: 'continuous',
      min: 0,
      max: 64,
      values: null,
      unit: '1/255',
    },
    display: null,
    ...over,
  }) as unknown as AttackSpecView

const result = (summary: Partial<QuickTryResult['summary']>): QuickTryResult =>
  ({
    level: 8,
    unit: '1/255',
    summary: {
      clean_count: 7,
      attacked_count: 13,
      missed_count: 3,
      new_count: 9,
      iou_threshold: 0.5,
      ...summary,
    },
  }) as unknown as QuickTryResult

describe('quick-try logic', () => {
  it('bỏ attack cần huấn luyện; FGSM là mặc định', () => {
    const specs = [
      spec({ name: 'adv_patch', requires_training: true }),
      spec({ name: 'fog' }),
      spec({}),
    ]
    expect(quickTryable(specs).map((s) => s.name)).toEqual(['fog', 'fgsm'])
    expect(defaultAttack(specs)?.name).toBe('fgsm')
  })

  it('mức gợi ý ưu tiên catalog, mức mặc định là quick_try_level hoặc mức giữa', () => {
    const withDisplay = spec({
      display: { recommended_levels: [2, 4, 8], quick_try_level: 8 } as AttackSpecView['display'],
    })
    expect(levelChoices(withDisplay)).toEqual([2, 4, 8])
    expect(defaultLevel(withDisplay)).toBe(8)
    expect(defaultLevel(spec({}))).toBe(4) // [1,2,4,8,16] → giữa
  })

  it('câu kết luận nói rõ bỏ sót và phát hiện sai', () => {
    expect(resultSentence(result({}), 'FGSM')).toBe(
      'FGSM ở mức 8/255 làm model bỏ sót 3/7 vật thể và thấy thêm 9 vật thể không có thật.',
    )
    expect(resultSentence(result({ missed_count: 0, new_count: 0 }), 'FGSM')).toContain(
      'chưa đánh lừa được model',
    )
  })

  it('màu khung theo phía và trạng thái khớp', () => {
    expect(boxTone('clean', false)).toBe('missed')
    expect(boxTone('attacked', false)).toBe('new')
    expect(boxTone('attacked', true)).toBe('kept')
    expect(formatLevel(0.3, '')).toBe('0.3')
  })

  it('kiểm tra file tải lên', () => {
    expect(uploadProblem({ type: 'image/gif', size: 10 })).toMatch(/PNG hoặc JPEG/)
    expect(uploadProblem({ type: 'image/png', size: 7 * 1024 * 1024 })).toMatch(/6 MB/)
    expect(uploadProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })
})
