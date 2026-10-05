/** Mẫu experiment, "Cấu hình nhanh" và nhảy bước (góp ý mentor: bớt bấm). */
import { describe, expect, it } from 'vitest'

import { listMocks } from '@/api/mocks'
import type {
  AttackSpec,
  ComputeTargetPublic,
  DatasetSummary,
  ModelSummary,
  ProtocolSummary,
  SliceSummary,
} from '@/contracts/api'

import {
  EXPERIMENT_TEMPLATES,
  firstIncomplete,
  pickDatasetVersion,
  pickModel,
  pickProtocol,
  pickSlice,
  pickTarget,
  reachableSteps,
  templateAttacks,
} from './quick'
import { type Draft, EMPTY_DRAFT } from './state'

const seedFiles = import.meta.glob<AttackSpec[]>('../../../../contracts/seeds/attack_specs.json', {
  eager: true,
  import: 'default',
})
const specs = Object.values(seedFiles)[0]
const fgsm = specs.find((s) => s.name === 'fgsm')
if (!fgsm) throw new Error('thiếu fgsm')

const proto = (id: string, version: number, status: ProtocolSummary['status']) =>
  ({ id, name: id, version, status, body_sha256: 'x' }) as ProtocolSummary

describe('chọn sẵn cho mẫu experiment', () => {
  it('protocol: active version cao nhất, không có active thì lấy cái có', () => {
    expect(
      pickProtocol([proto('a', 1, 'active'), proto('b', 3, 'dev'), proto('c', 2, 'active')])?.id,
    ).toBe('c')
    expect(pickProtocol([proto('d', 1, 'dev')])?.id).toBe('d')
    expect(pickProtocol([])).toBeNull()
  })

  it('model và dataset version mới nhất theo created_at', () => {
    const models = listMocks<ModelSummary>('model_summary')
    const latest = [...models].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    expect(pickModel(models)?.id).toBe(latest.id)
    const datasets = listMocks<DatasetSummary>('dataset_summary')
    const versions = datasets.flatMap((d) => d.versions)
    const newest = [...versions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    expect(pickDatasetVersion(datasets)).toBe(newest.id)
  })

  it('slice lớn nhất / nhỏ nhất trong các slice đủ lớn theo protocol', () => {
    const s = (id: string, size: number) => ({ id, size }) as SliceSummary
    const list = [s('a', 10), s('b', 300), s('c', 50)]
    expect(pickSlice(list, 20, 'largest')?.id).toBe('b')
    expect(pickSlice(list, 20, 'smallest')?.id).toBe('c')
    expect(pickSlice(list, 500, 'largest')).toBeNull()
  })

  it('máy local đang online', () => {
    const t = (id: string, kind: string, online: boolean) =>
      ({ id, kind, online }) as unknown as ComputeTargetPublic
    expect(
      pickTarget([t('x', 'cloud', true), t('a', 'local', false), t('b', 'local', true)])?.id,
    ).toBe('b')
    expect(pickTarget([t('x', 'cloud', true)])).toBeNull()
  })

  it('attack theo mẫu: Cấu hình nhanh thêm FGSM khi protocol không bắt buộc gì, Dò nhanh luôn thêm, Toàn bộ catalog lấy hết', () => {
    const [fast, probe, full] = EXPERIMENT_TEMPLATES
    const added = templateAttacks(fast, [], specs)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ attackSpecId: fgsm.id, levels: [2, 4, 8], mode: 'grid' })
    const pgd = templateAttacks(full, [], specs).find((a) => a.attackSpecId !== fgsm.id)
    if (!pgd) throw new Error('catalog chỉ có fgsm')
    expect(templateAttacks(fast, [pgd], specs)).toEqual([pgd])
    expect(templateAttacks(probe, [pgd], specs).map((a) => a.attackSpecId)).toEqual([
      pgd.attackSpecId,
      fgsm.id,
    ])
    expect(templateAttacks(full, [], specs)).toHaveLength(specs.length)
  })
})

describe('nhảy bước', () => {
  const complete: Draft = {
    ...EMPTY_DRAFT,
    protocolId: 'p',
    modelId: 'm',
    datasetVersionId: 'dv',
    sliceId: 's',
    mappingId: 'map',
    targetId: 't',
    limitSeconds: 600,
    attacks: templateAttacks(EXPERIMENT_TEMPLATES[0], [], specs),
  }

  it('bước đầu còn thiếu; đủ hết thì là bước xác nhận', () => {
    expect(firstIncomplete(EMPTY_DRAFT)).toBe(1)
    expect(firstIncomplete({ ...complete, sliceId: null })).toBe(3)
    expect(firstIncomplete(complete)).toBe(6)
    expect(firstIncomplete(complete, { maxLimitSeconds: 60 })).toBe(5)
  })

  it('nhảy được tới mọi bước đã đủ, kể cả khi đang lùi về bước 2', () => {
    expect(reachableSteps(EMPTY_DRAFT)).toEqual([1])
    expect(reachableSteps({ ...complete, step: 2 })).toEqual([1, 2, 3, 4, 5, 6])
    expect(reachableSteps({ ...complete, step: 2, attacks: [] })).toEqual([1, 2, 3, 4])
  })
})
