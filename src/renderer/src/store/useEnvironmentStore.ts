import { create } from 'zustand'
import type { Environment, EnvironmentsData } from '../../../shared/types'

interface EnvironmentState {
  data: EnvironmentsData
  load: () => Promise<void>
  save: (data: EnvironmentsData) => Promise<void>
  setActive: (id: string | null) => Promise<void>
  getActive: () => Environment | null
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  data: { activeId: null, environments: [] },

  load: async () => {
    set({ data: await window.api.loadEnvironments() })
  },

  // Primero persiste; si falla (ej: keychain), el estado no cambia
  save: async (data) => {
    await window.api.saveEnvironments(data)
    set({ data })
  },

  setActive: async (id) => {
    await get().save({ ...get().data, activeId: id })
  },

  getActive: () => {
    const { data } = get()
    return data.environments.find((e) => e.id === data.activeId) ?? null
  }
}))