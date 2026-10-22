import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { CurrentUser, Ontology } from '../api/types'
import { AppContext, canEditRole } from '../context'

/** 컴포넌트 테스트용 온톨로지. 실제 YAML 과 같은 모양이고, 화면 코드가 모르는 타입(Person)이 들어 있다 */
export const testOntology: Ontology = {
  schemaVersion: 'test',
  nodeTypes: {
    Company: {
      label: '기업',
      description: '기업',
      labelProperty: 'name',
      hintProperties: ['country'],
      properties: {
        name: { type: 'string', label: '기업 이름', required: true, description: '기업의 공식 이름. 예: 삼성전자' },
        country: {
          type: 'enum',
          label: '국가',
          required: false,
          values: ['KR', 'US'],
          valueLabels: { KR: '대한민국 (KR)', US: '미국 (US)' },
          description: '기업이 등록된 나라',
        },
      },
    },
    Security: {
      label: '종목',
      description: '종목',
      labelProperty: 'name',
      hintProperties: ['market'],
      properties: {
        market: {
          type: 'enum',
          label: '상장 시장',
          required: true,
          values: ['KRX_KOSPI', 'KRX_KOSDAQ'],
          valueLabels: { KRX_KOSPI: '코스피', KRX_KOSDAQ: '코스닥' },
        },
        name: { type: 'string', label: '종목 이름', required: true },
      },
    },
    Document: {
      label: '근거 문서',
      description: '근거 자료',
      labelProperty: 'title',
      properties: {
        title: { type: 'string', label: '제목', required: true },
        url: { type: 'url', label: '주소', required: true },
      },
    },
    Person: {
      label: '인물',
      description: '투자 거장',
      labelProperty: 'name',
      properties: {
        name: { type: 'string', label: '이름', required: true, description: '널리 알려진 이름' },
        style: {
          type: 'enum',
          label: '투자 스타일',
          required: false,
          values: ['VALUE', 'GROWTH'],
          valueLabels: { VALUE: '가치 투자', GROWTH: '성장 투자' },
        },
      },
    },
    Claim: {
      label: '주장',
      description: '주장',
      labelProperty: 'predicate',
      managedBy: 'claims',
      properties: {
        predicate: { type: 'enum', label: '관계 종류', required: true, values: ['SUPPLIES_TO'], valueLabels: { SUPPLIES_TO: '공급한다' } },
      },
    },
  },
  relationshipTypes: { ISSUES: { label: '발행한다', description: '', from: ['Company'], to: ['Security'], createPicker: { label: '발행 기업' } } },
  claimRelationships: { SUBJECT: { label: '주체', description: '' }, OBJECT: { label: '대상', description: '' } },
  claimPredicates: { SUPPLIES_TO: { label: '공급한다', description: '', sentence: '{subject}이(가) {object}에 공급한다', subjectTypes: ['Company'], objectTypes: ['Company'] } },
  reviewStatuses: { DRAFT: { label: '초안' }, REVIEWED: { label: '검토 완료' }, REJECTED: { label: '반려' } },
  changeActions: { CREATE: { label: '만들기' }, ARCHIVE: { label: '보관' } },
}

const editor: CurrentUser = { id: 'u1', email: 'a@example.com', displayName: 'A', role: 'EDITOR' }

export function withApp(children: ReactNode, ontology: Ontology = testOntology, user: CurrentUser = editor, initialPath = '/workspace') {
  return (
    <MemoryRouter initialEntries={[initialPath]} useTransitions={false}>
      <AppContext.Provider value={{ user, ontology, canEdit: canEditRole(user.role) }}>{children}</AppContext.Provider>
    </MemoryRouter>
  )
}
