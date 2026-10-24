import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Ontology } from '../../api/types'
import { orderedTypes } from '../../lib/typeOrder'
import { NodeCreateForm } from '../NodeCreateForm'
import { testOntology, withApp } from '../testSupport'
import { addMenuEntries } from './AddMenu'

// Radix 메뉴와 창은 Portal 로 그려 서버 렌더에서 보이지 않는다. 메뉴의 줄은 순수 함수로, 폼은 그대로 그려 본다.

/** 설명이 두 문장인 타입을 둔 온톨로지 */
function ontologyWithLongDescription(): Ontology {
  const o: Ontology = structuredClone(testOntology)
  o.nodeTypes.Company.description = '사업을 하는 회사다. 상장 여부와 상관없이 등록한다.'
  return o
}

describe('「＋ 추가」 메뉴의 줄', () => {
  it('타입 순서대로 두고 주장 줄은 맨 아래 구분선 밑에 둔다', () => {
    const entries = addMenuEntries(testOntology)
    expect(entries.map((e) => e.type)).toEqual([...orderedTypes(testOntology), 'Claim'])
    expect(entries.filter((e) => e.separatorBefore).map((e) => e.type)).toEqual(['Claim'])
    expect(entries.find((e) => e.type === 'Person')?.label).toBe('인물')
  })

  it('짧은 설명은 타입 설명의 첫 문장이다', () => {
    const company = addMenuEntries(ontologyWithLongDescription()).find((e) => e.type === 'Company')
    expect(company?.summary).toBe('사업을 하는 회사다.')
  })

  it('주장 종류가 하나도 없으면 주장 줄이 없다', () => {
    const o: Ontology = structuredClone(testOntology)
    o.claimPredicates = {}
    const entries = addMenuEntries(o)
    expect(entries.map((e) => e.type)).toEqual(orderedTypes(o))
    expect(entries.some((e) => e.separatorBefore)).toBe(false)
  })
})

describe('만들기 폼의 선택 속성', () => {
  it('처음에는 필수 칸만 보이고 「선택 항목 더 보기」 가 있다', () => {
    const html = renderToStaticMarkup(withApp(<NodeCreateForm type="Company" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toContain('data-testid="create-prop-name"')
    expect(html).not.toContain('data-testid="create-prop-country"')
    expect(html).toMatch(/aria-expanded="false"[^>]*data-testid="create-optional-toggle"/)
  })

  it('선택 칸이 없는 타입에는 펼치기 단추가 없다', () => {
    const html = renderToStaticMarkup(withApp(<NodeCreateForm type="Document" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toContain('data-testid="create-prop-title"')
    expect(html).not.toContain('create-optional-toggle')
  })

  it('단계 소제목은 만들기 창에서만 그린다', () => {
    const inDialog = renderToStaticMarkup(
      withApp(<NodeCreateForm type="Security" testIdPrefix="create" showStepHeadings onCreated={() => {}} onCancel={() => {}} />),
    )
    expect(inDialog).toContain('2. 내용 적기')
    expect(inDialog).toContain('3. 연결하기 (선택)')
    const inClaim = renderToStaticMarkup(withApp(<NodeCreateForm type="Document" testIdPrefix="claim-doc-create" onCreated={() => {}} onCancel={() => {}} />))
    expect(inClaim).not.toContain('2. 내용 적기')
  })
})
