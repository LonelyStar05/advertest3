/**
 * Ý nghĩa ba quyết định review và ba kết luận về model (góp ý mentor: "duyệt / không duyệt nghĩa
 * là gì?"). Một nơi cho trang review, tab Review và khối bước tiếp theo.
 */
import type { ExperimentStatus, ModelVerdict, ReviewDecision } from '@/contracts/api'

export interface DecisionMeaning {
  decision: ReviewDecision
  title: string
  /** Quyết định này nói gì về bài test. */
  means: string
  /** Điều xảy ra tiếp theo. */
  next: string
  /** Hiểu lầm hay gặp (không bắt buộc). */
  caveat?: string
}

export const DECISION_MEANING: readonly DecisionMeaning[] = [
  {
    decision: 'approve',
    title: 'Chấp nhận',
    means: 'Bài test làm đúng protocol và kết quả đáng tin.',
    next: 'Hệ thống phát hành report chính thức có mã xác minh; ai cũng kiểm tra được file report.',
    caveat:
      'Không có nghĩa là model đạt. Model đạt hay không đạt tiêu chí là mục "Kết luận về model" riêng.',
  },
  {
    decision: 'changes_requested',
    title: 'Yêu cầu sửa',
    means: 'Bài test còn lỗi sửa được: thiếu case, sai cấu hình, cần chạy thêm.',
    next: 'Engineer nhân bản experiment, sửa cấu hình và chạy lại. Experiment cũ giữ nguyên để đối chiếu.',
  },
  {
    decision: 'reject',
    title: 'Từ chối',
    means: 'Bài test không dùng được: sai dữ liệu, sai protocol, kết quả không tin được.',
    next: 'Không có report. Experiment giữ lại làm lịch sử; muốn kiểm lại thì tạo experiment mới.',
  },
]

/** Ý nghĩa ba kết luận về model (chỉ có khi chấp nhận bài test). */
export const MODEL_VERDICT_MEANING: Record<ModelVerdict, string> = {
  meets_criteria: 'Mọi tiêu chí đạt của protocol được thỏa: model đủ bền với các attack đã kiểm.',
  does_not_meet:
    'Ít nhất một tiêu chí không thỏa: bài test vẫn đúng và đáng tin, nhưng model chưa đủ bền.',
  conditional:
    'Model chỉ dùng được với điều kiện ghi trong phần kết luận, ví dụ chỉ ban ngày hoặc cần huấn luyện thêm.',
}

/** Quyết định đã có theo trạng thái experiment (null: chưa quyết định). */
export function decisionOf(status: ExperimentStatus): ReviewDecision | null {
  if (status === 'approved') return 'approve'
  if (status === 'changes_requested') return 'changes_requested'
  if (status === 'rejected') return 'reject'
  return null
}

/** Trạng thái nên hiện giải thích (đã gửi duyệt hoặc đã có quyết định). */
export const EXPLAIN_STATUSES: readonly ExperimentStatus[] = [
  'submitted_for_review',
  'in_review',
  'approved',
  'changes_requested',
  'rejected',
]
