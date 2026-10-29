import { create } from 'zustand'
import type { CollectionItem } from '../../../shared/types'

interface CollectionsState {
  collections: CollectionItem[]
  refresh: () => Promise<void>
}

export const useCollectionsStore = create<CollectionsState>((set) => ({
  collections: [],
  refresh: async () => {
    set({ collections: await window.api.listCollections() })
  }
}))