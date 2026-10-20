import { createContext, useContext } from 'react'
import type { CurrentUser, Ontology } from './api/types'

export interface AppContextValue {
  user: CurrentUser
  ontology: Ontology
  /** EDITOR 와 ADMIN. VIEWER 는 조회만 한다. 서버도 403 FORBIDDEN 으로 막는다 */
  canEdit: boolean
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

export function canEditRole(role: string): boolean {
  return role === 'EDITOR' || role === 'ADMIN'
}

export const ROLE_LABEL: Record<string, string> = { VIEWER: '열람자', EDITOR: '편집자', ADMIN: '관리자' }
