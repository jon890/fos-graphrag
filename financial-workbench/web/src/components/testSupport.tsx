import type { ReactNode } from 'react'
import type { CurrentUser, Ontology } from '../api/types'
import { AppContext } from '../context'

/** 컴포넌트 테스트용 온톨로지. 실제 YAML 과 같은 모양이고, 화면 코드가 모르는 타입(Person)이 들어 있다 */
export const testOntology: Ontology = {
  schemaVersion: 'test',
  nodeTypes: {
    Company: {
      label: '기업',
      description: '기업',
      labelProperty: 'name',
      properties: {
        name: { type: 'string', label: '기업 이름', required: true, description: '기업의 공식 이름. 예: 삼성전자' },
        country: { type: 'string', label: '국가', required: false, maxLength: 2, description: '두 글자 국가 코드. 예: KR, US' },
      },
    },
    Security: {
      label: '종목',
      description: '종목',
      labelProperty: 'name',
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
      properties: { title: { type: 'string', label: '제목', required: true } },
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
  relationshipTypes: { ISSUES: { label: '발행한다', description: '', from: ['Company'], to: ['Security'] } },
  claimRelationships: { SUBJECT: { label: '주체', description: '' }, OBJECT: { label: '대상', description: '' } },
  claimPredicates: { SUPPLIES_TO: { label: '공급한다', description: '', subjectTypes: ['Company'], objectTypes: ['Company'] } },
  reviewStatuses: { DRAFT: { label: '초안' }, REVIEWED: { label: '검토 완료' }, REJECTED: { label: '반려' } },
  changeActions: { CREATE: { label: '만들기' }, ARCHIVE: { label: '보관' } },
}

const user: CurrentUser = { id: 'u1', email: 'a@example.com', displayName: 'A', role: 'EDITOR' }

export function withApp(children: ReactNode, ontology: Ontology = testOntology) {
  return <AppContext.Provider value={{ user, ontology, canEdit: true }}>{children}</AppContext.Provider>
}
