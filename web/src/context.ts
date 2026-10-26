import { createContext, useContext, useMemo } from 'react'
import type { CurrentUser, NodeView, Ontology } from './api/types'
import {
  actionLabel,
  nodeDisplayLabel,
  nodeHint,
  predicateLabel,
  propertyDef,
  propertyLabel,
  relationshipLabel,
  reviewStatusKeys,
  reviewStatusLabel,
  typeKeys,
  typeLabel,
  valueLabel,
} from './lib/labels'

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

/** 현재 온톨로지의 표시 이름을 읽는 함수 묶음. 이름이 없으면 키를 그대로 돌려준다 */
export function useLabels() {
  const { ontology } = useApp()
  return useMemo(
    () => ({
      /** 노드 타입 키 목록. YAML 순서 */
      types: typeKeys(ontology),
      reviewStatuses: reviewStatusKeys(ontology),
      type: (type: string) => typeLabel(ontology, type),
      property: (type: string, prop: string) => propertyLabel(ontology, type, prop),
      propertyDef: (type: string, prop: string) => propertyDef(ontology, type, prop),
      value: (type: string, prop: string, value: unknown) => valueLabel(ontology, type, prop, value),
      relationship: (key: string) => relationshipLabel(ontology, key),
      predicate: (key: string) => predicateLabel(ontology, key),
      status: (status: string) => reviewStatusLabel(ontology, status),
      action: (action: string) => actionLabel(ontology, action),
      node: (node: { type: string; label: string }) => nodeDisplayLabel(ontology, node),
      hint: (node: Pick<NodeView, 'type' | 'properties' | 'createdAt'>) => nodeHint(ontology, node),
    }),
    [ontology],
  )
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
