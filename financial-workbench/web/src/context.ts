import { createContext, useContext } from 'react'
import type { Ontology, UserRef } from './api/types'

export interface AppContextValue {
  user: UserRef
  ontology: Ontology
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext 가 없습니다.')
  return ctx
}

/** 사용자가 직접 만들 수 있는 노드 타입. managedBy 가 있는 Claim 은 전용 API 로 만든다. */
export function creatableTypes(ontology: Ontology): string[] {
  return Object.entries(ontology.nodeTypes)
    .filter(([, def]) => !def.managedBy)
    .map(([name]) => name)
}
