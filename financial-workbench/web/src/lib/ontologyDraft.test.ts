import { describe, expect, it } from 'vitest'
import type { Ontology, OntologyDefinition } from '../api/types'
import {
  addNodeType,
  applyRemoved,
  keyError,
  RELOAD_FAILED_HINT,
  reloadSucceeded,
  savedMessage,
  sentenceError,
  toDefinition,
  toggleRemoved,
  updateProperty,
} from './ontologyDraft'

const definition: OntologyDefinition = {
  schemaVersion: 'test',
  nodeTypes: {
    Company: {
      label: '기업',
      description: '기업',
      labelProperty: 'name',
      hintProperties: ['country'],
      properties: {
        name: { type: 'string', required: true },
        country: { type: 'enum', required: false, values: ['KR', 'US'], valueLabels: { KR: '대한민국', US: '미국' }, valueAliases: { US: ['USA'] } },
      },
    },
    Concept: { label: '개념', description: '개념', labelProperty: 'name', properties: { name: { type: 'string', required: true } } },
    Person: {
      label: '인물',
      description: '인물',
      labelProperty: 'name',
      searchProperties: ['englishName'],
      properties: { name: { type: 'string', required: true }, englishName: { type: 'string', required: false } },
    },
  },
  relationshipTypes: {
    RELATED_TO: { description: '', from: ['Company', 'Concept'], to: ['Concept'] },
    ISSUES: { description: '', from: ['Company'], to: ['Company'] },
  },
  claimPredicates: {
    ADVOCATES: { description: '', subjectTypes: ['Person'], objectTypes: ['Concept', 'Company'], sentence: '{subject}이(가) {object}을(를) 강조한다' },
  },
}

describe('toDefinition', () => {
  it('서버가 거절하는 버전 정보를 뺀다', () => {
    const ontology: Ontology = { ...definition, version: 3, versionCreatedAt: '2026-10-20T03:15:00Z', versionCreatedBy: null }
    const result = toDefinition(ontology)
    expect(result).not.toHaveProperty('version')
    expect(result).not.toHaveProperty('versionCreatedAt')
    expect(result).not.toHaveProperty('versionCreatedBy')
    expect(result.nodeTypes).toBe(ontology.nodeTypes)
  })
})

describe('addNodeType', () => {
  it('라벨 속성을 필수 string 으로 함께 만들고 입력 정의를 바꾸지 않는다', () => {
    const before = JSON.stringify(definition)
    const next = addNodeType(definition, 'Fund', {
      label: '펀드',
      description: '투자 펀드',
      labelProperty: 'name',
      labelPropertyLabel: '펀드 이름',
      color: '#112233',
      shape: 'hexagon',
    })
    expect(next.nodeTypes.Fund.properties.name).toEqual({ type: 'string', label: '펀드 이름', required: true, maxLength: 200 })
    expect(next.nodeTypes.Fund.labelProperty).toBe('name')
    expect(next.nodeTypes.Fund.display).toEqual({ color: '#112233', shape: 'hexagon' })
    expect(JSON.stringify(definition)).toBe(before)
  })
})

describe('updateProperty', () => {
  it('enum 값을 빼면 그 값의 표시 이름과 예전 표기도 뺀다', () => {
    const next = updateProperty(definition, 'Company', 'country', { values: ['KR'] })
    const country = next.nodeTypes.Company.properties.country
    expect(country.values).toEqual(['KR'])
    expect(country.valueLabels).toEqual({ KR: '대한민국' })
    expect(country).not.toHaveProperty('valueAliases')
    expect(definition.nodeTypes.Company.properties.country.valueLabels).toEqual({ KR: '대한민국', US: '미국' })
  })

  it('값이 undefined 인 patch 는 그 키를 지운다', () => {
    const withMax = updateProperty(definition, 'Person', 'name', { maxLength: 50 })
    expect(withMax.nodeTypes.Person.properties.name.maxLength).toBe(50)
    const cleared = updateProperty(withMax, 'Person', 'name', { maxLength: undefined })
    expect(cleared.nodeTypes.Person.properties.name).not.toHaveProperty('maxLength')
  })
})

describe('applyRemoved', () => {
  it('타입을 빼면 관계 종류와 주장 종류의 타입 목록에서도 뺀다', () => {
    const next = applyRemoved(definition, ['nodeTypes.Concept'])
    expect(next.nodeTypes).not.toHaveProperty('Concept')
    expect(next.relationshipTypes.RELATED_TO.from).toEqual(['Company'])
    expect(next.relationshipTypes.RELATED_TO.to).toEqual([])
    expect(next.claimPredicates.ADVOCATES.objectTypes).toEqual(['Company'])
  })

  it('속성을 빼면 그 타입의 hintProperties 와 searchProperties 에서도 뺀다', () => {
    const next = applyRemoved(definition, ['nodeTypes.Company.properties.country', 'nodeTypes.Person.properties.englishName'])
    expect(next.nodeTypes.Company.properties).not.toHaveProperty('country')
    expect(next.nodeTypes.Company.hintProperties).toEqual([])
    expect(next.nodeTypes.Person.searchProperties).toEqual([])
  })

  it('관계 종류와 주장 종류를 뺀다', () => {
    const next = applyRemoved(definition, ['relationshipTypes.ISSUES', 'claimPredicates.ADVOCATES'])
    expect(Object.keys(next.relationshipTypes)).toEqual(['RELATED_TO'])
    expect(next.claimPredicates).toEqual({})
  })

  it('입력 정의를 바꾸지 않는다', () => {
    const before = JSON.stringify(definition)
    applyRemoved(definition, ['nodeTypes.Concept', 'nodeTypes.Person.properties.englishName'])
    expect(JSON.stringify(definition)).toBe(before)
  })
})

describe('toggleRemoved', () => {
  it('두 번 부르면 처음 목록과 같다', () => {
    const start = ['nodeTypes.Concept']
    const once = toggleRemoved(start, 'relationshipTypes.ISSUES')
    expect(once).toEqual(['nodeTypes.Concept', 'relationshipTypes.ISSUES'])
    expect(toggleRemoved(once, 'relationshipTypes.ISSUES')).toEqual(start)
    expect(start).toEqual(['nodeTypes.Concept'])
  })
})

describe('keyError', () => {
  it.each([
    ['nodeType', 'fund', []],
    ['property', 'Name', []],
    ['property', 'revision', []],
    ['property', '_x', []],
    ['relationshipType', 'ISSUES', ['ISSUES']],
    ['claimPredicate', 'advocates', []],
  ] as const)('%s 의 %s 는 오류다', (kind, key, existing) => {
    expect(keyError(kind, key, [...existing])).toEqual(expect.any(String))
  })

  it('형식에 맞는 새 키는 오류가 아니다', () => {
    expect(keyError('nodeType', 'Fund', [])).toBeNull()
    expect(keyError('property', 'nickname', ['name'])).toBeNull()
    expect(keyError('relationshipType', 'OWNS_STAKE', [])).toBeNull()
  })
})

describe('sentenceError', () => {
  it('자리가 빠졌거나 겹치면 오류다', () => {
    expect(sentenceError('{subject}이(가) 강조한다')).toBe('문장 틀에 {subject} 와 {object} 를 한 번씩 넣습니다')
    expect(sentenceError('{subject}이(가) {object} {object}')).not.toBeNull()
  })

  it('한 번씩 있으면 오류가 아니다', () => {
    expect(sentenceError('{subject}이(가) {object}을(를) 강조한다')).toBeNull()
  })
})

describe('reloadSucceeded', () => {
  it('다시 읽기가 실패해도 던지지 않고 false 를 돌려준다', async () => {
    expect(await reloadSucceeded(async () => {})).toBe(true)
    expect(await reloadSucceeded(() => Promise.reject(new Error('down')))).toBe(false)
  })

  it('저장 안내는 다시 읽지 못했을 때 그 사실을 덧붙인다', () => {
    expect(savedMessage(3, true)).toBe('버전 3 을 저장했습니다.')
    expect(savedMessage(3, false)).toBe(`버전 3 을 저장했지만 ${RELOAD_FAILED_HINT}`)
  })
})
