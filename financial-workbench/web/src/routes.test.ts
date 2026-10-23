import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_QUERY,
  changesSearch,
  isSafeReturnTo,
  legacyRedirect,
  listSearch,
  ontologySearch,
  parseChangesQuery,
  parseListQuery,
  parseOntologyQuery,
  parseReviewQuery,
  parseWorkspaceQuery,
  reviewSearch,
  tabOfPath,
  workspaceSearch,
} from './routes'

describe('tabOfPath', () => {
  it('경로의 탭을 돌려주고 모르는 경로는 null 이다', () => {
    expect(tabOfPath('/changes')).toBe('changes')
    expect(tabOfPath('/')).toBeNull()
    expect(tabOfPath('/nope')).toBeNull()
  })
})

describe('작업 공간 query', () => {
  it('기본값이면 query 를 쓰지 않는다', () => {
    expect(workspaceSearch(DEFAULT_WORKSPACE_QUERY)).toBe('')
  })

  it('표 순서로 쓰고 읽으면 처음 값으로 돌아온다', () => {
    const x = { ...DEFAULT_WORKSPACE_QUERY, node: 'a', pane: 'detail' as const, hops: 2, types: ['Company', 'Security'] }
    expect(workspaceSearch(x)).toBe('?node=a&pane=detail&types=Company%2CSecurity&hops=2')
    expect(parseWorkspaceQuery(workspaceSearch(x))).toEqual(x)
    const all = {
      node: 'n 1',
      center: 'c1',
      pane: 'graph' as const,
      q: '삼성 전자',
      types: ['Company'],
      status: 'DRAFT',
      archived: true,
      hops: 2,
      claimsAsNodes: true,
    }
    expect(parseWorkspaceQuery(workspaceSearch(all))).toEqual(all)
  })

  it('알 수 없는 값은 기본값으로 읽는다', () => {
    expect(parseWorkspaceQuery('?hops=abc').hops).toBe(1)
    expect(parseWorkspaceQuery('?hops=3').hops).toBe(1)
    expect(parseWorkspaceQuery('?pane=zzz').pane).toBeNull()
    expect(parseWorkspaceQuery('?types=').types).toBeNull()
  })

  it('공백은 %20 으로 쓴다', () => {
    expect(workspaceSearch({ ...DEFAULT_WORKSPACE_QUERY, q: 'a b' })).toBe('?q=a%20b')
  })
})

describe('목록, 검토 대기, 변경 이력 query', () => {
  it('목록은 기본값을 쓰지 않고 왕복한다', () => {
    expect(listSearch({ type: '', q: '', archived: false, page: 0 })).toBe('')
    const x = { type: 'Company', q: 'a b', archived: true, page: 2 }
    expect(listSearch(x)).toBe('?type=Company&q=a%20b&archived=1&page=2')
    expect(parseListQuery(listSearch(x))).toEqual(x)
    expect(parseListQuery('?page=-1').page).toBe(0)
    expect(parseListQuery('?page=x').page).toBe(0)
  })

  it('검토 대기는 두 쪽 번호를 왕복한다', () => {
    expect(reviewSearch({ page: 0, minePage: 0 })).toBe('')
    expect(reviewSearch({ page: 1, minePage: 3 })).toBe('?page=1&minePage=3')
    expect(parseReviewQuery('?page=1&minePage=3')).toEqual({ page: 1, minePage: 3 })
  })

  it('변경 이력은 대상, 사용자, 쪽을 왕복한다', () => {
    expect(changesSearch({ target: '', actor: '', page: 0 })).toBe('')
    const x = { target: 'n1', actor: 'a@example.com', page: 1 }
    expect(changesSearch(x)).toBe('?target=n1&actor=a%40example.com&page=1')
    expect(parseChangesQuery(changesSearch(x))).toEqual(x)
  })
})

describe('legacyRedirect', () => {
  it('옛 /?node= 링크를 새 주소로 바꾼다', () => {
    expect(legacyRedirect('/', '?node=a%20b')).toBe('/workspace?node=a%20b&pane=detail')
  })

  it('해당 없으면 null 이다', () => {
    expect(legacyRedirect('/workspace', '?node=a')).toBeNull()
    expect(legacyRedirect('/', '')).toBeNull()
    expect(legacyRedirect('/', '?node=')).toBeNull()
  })
})

describe('isSafeReturnTo', () => {
  it('화면 경로만 받는다', () => {
    expect(isSafeReturnTo('/changes?target=x')).toBe(true)
    expect(isSafeReturnTo('/workspace')).toBe(true)
    for (const bad of ['//evil.example', 'https://x', '/nope', '/workspacefoo', '']) expect(isSafeReturnTo(bad)).toBe(false)
  })
})

describe('온톨로지 주소', () => {
  it('view 와 version 을 읽고 모르는 값은 버린다', () => {
    expect(parseOntologyQuery('?view=history&version=3')).toEqual({ view: 'history', version: 3 })
    expect(parseOntologyQuery('?view=nope&version=x')).toEqual({})
    expect(parseOntologyQuery('')).toEqual({})
  })

  it('기본값은 쓰지 않고 view 와 version 을 순서대로 만든다', () => {
    expect(ontologySearch({ view: 'yaml' })).toBe('?view=yaml')
    expect(ontologySearch({ view: 'history', version: 3 })).toBe('?view=history&version=3')
    expect(ontologySearch({})).toBe('')
  })
})
