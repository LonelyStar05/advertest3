import { useMutation, useQuery } from '@tanstack/react-query'

import { apiGet, apiSend } from '@/api/client'
import type { QuickTryImage, QuickTryRequest, QuickTryResult } from '@/contracts/api'

export function useQuickTryImages() {
  return useQuery({
    queryKey: ['quick-try', 'images'],
    queryFn: () => apiGet<QuickTryImage[]>('/quick-try/images?limit=12'),
    staleTime: 5 * 60_000,
  })
}

export function useRunQuickTry() {
  return useMutation({
    mutationFn: (body: QuickTryRequest) => apiSend<QuickTryResult>('POST', '/quick-try', body),
  })
}
