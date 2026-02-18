/**
 * Hook test: useTenantMunicipality (tenant context for weather/parcels).
 * Verifies initial state and resolved municipality when API returns data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTenantMunicipality } from '../useTenantMunicipality'

vi.mock('@/services/api', () => ({
  default: {
    getWeatherLocations: vi.fn(),
    searchMunicipalities: vi.fn(),
  },
}))
vi.mock('@/services/parcelApi', () => ({
  parcelApi: {
    getParcels: vi.fn(),
  },
}))

import api from '@/services/api'
import { parcelApi } from '@/services/parcelApi'

describe('useTenantMunicipality', () => {
  beforeEach(() => {
    vi.mocked(api.getWeatherLocations).mockResolvedValue([])
    vi.mocked(parcelApi.getParcels).mockResolvedValue([])
  })

  it('starts with loading true and municipality null', () => {
    const { result } = renderHook(() => useTenantMunicipality())
    expect(result.current.loading).toBe(true)
    expect(result.current.municipality).toBe(null)
  })

  it('sets municipality from primary weather location when available', async () => {
    vi.mocked(api.getWeatherLocations).mockResolvedValue([
      { is_primary: true, municipality_code: '48020', municipality_name: 'Bilbao', province: 'Bizkaia' },
    ])
    const { result } = renderHook(() => useTenantMunicipality())
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.municipality).toEqual({
      code: '48020',
      name: 'Bilbao',
      province: 'Bizkaia',
    })
  })
})
