import {
  syncBackendAssetsToLocalCache as syncBackendAssetsToLocalCacheInService,
  syncBackendTasksToStore as syncBackendTasksToStoreInService,
  type BackendSyncContext,
} from '../../services/backendSync'

type BackendSyncActionsDeps = {
  createContext: () => BackendSyncContext
}

export function createBackendSyncActions({ createContext }: BackendSyncActionsDeps) {
  return {
    syncBackendTasksToStore() {
      return syncBackendTasksToStoreInService(createContext())
    },

    syncBackendAssetsToLocalCache() {
      return syncBackendAssetsToLocalCacheInService(createContext())
    },
  }
}
