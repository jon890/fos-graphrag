import { Fragment, useRef, type ReactNode } from 'react'
import type { Ontology } from '../../api/types'
import { useApp } from '../../context'
import { firstSentence, typeLabel } from '../../lib/labels'
import { managedTypes, orderedTypes } from '../../lib/typeOrder'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TypeBadge } from '../TypeBadge'
import { useAdd } from './AddProvider'

export interface AddMenuEntry {
  type: string
  label: string
  /** 타입 설명의 첫 문장 */
  summary: string
  /** 이 줄 위에 구분선을 그린다. 주장 줄이다 */
  separatorBefore: boolean
}

/** 메뉴의 줄. 타입 순서대로 두고, 주장 종류가 하나라도 있으면 맨 아래 구분선 밑에 주장 줄을 둔다 */
export function addMenuEntries(ontology: Ontology): AddMenuEntry[] {
  const entry = (type: string, separatorBefore: boolean): AddMenuEntry => ({
    type,
    label: typeLabel(ontology, type),
    summary: firstSentence(ontology.nodeTypes[type]?.description),
    separatorBefore,
  })
  const nodes = orderedTypes(ontology).map((type) => entry(type, false))
  if (Object.keys(ontology.claimPredicates).length === 0) return nodes
  // 만들기 창은 주장 폼만 따로 그리므로 주장(claims 가 관리하는 타입)만 메뉴에 둔다.
  const claims = managedTypes(ontology).filter((type) => ontology.nodeTypes[type].managedBy === 'claims')
  return [...nodes, ...claims.map((type, i) => entry(type, i === 0 && nodes.length > 0))]
}

interface Props {
  /** 메뉴를 여는 단추. DropdownMenuTrigger 의 asChild 로 그린다 */
  trigger: ReactNode
  align?: 'start' | 'end'
}

/**
 * 「＋ 추가」 의 타입 메뉴. 고르면 그 타입의 만들기 창을 연다.
 * 모달 메뉴는 스크롤을 잠그려고 <style> 을 넣어 CSP(style-src 'self')에 막히므로 modal={false} 로 연다.
 */
export function AddMenu({ trigger, align = 'start' }: Props) {
  const { ontology } = useApp()
  const { open } = useAdd()
  // 줄을 골라 창을 열었으면 메뉴가 닫히며 단추로 초점을 돌려보내지 않는다. 창 밖으로 초점이 나가 창이 닫히는 것을 막는다.
  const pickedRef = useRef(false)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-72 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(event) => {
          if (pickedRef.current) event.preventDefault()
          pickedRef.current = false
        }}
      >
        {addMenuEntries(ontology).map((e) => (
          <Fragment key={e.type}>
            {e.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="items-start"
              data-testid={`add-type-${e.type}`}
              onSelect={() => {
                pickedRef.current = true
                open(e.type)
              }}
            >
              <TypeBadge type={e.type} />
              <span className="grid min-w-0">
                <span>{e.label}</span>
                {e.summary && <span className="text-xs text-muted-foreground">{e.summary}</span>}
              </span>
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
