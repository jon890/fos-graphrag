import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_QUERY,
  changesSearch,
  isSafeReturnTo,
  legacyRedirect,
  listSearch,
  mapSearch,
  moreItems,
  ontologySearch,
  parseChangesQuery,
  parseListQuery,
  parseMapQuery,
  parseOntologyQuery,
  parseProposalsQuery,
  parseReviewQuery,
  parseStudyQuery,
  parseTraceQuery,
  parseTradesQuery,
  parseWorkspaceQuery,
  proposalsSearch,
  reviewSearch,
  studySearch,
  tabOfPath,
  TOP_TABS,
  traceSearch,
  tradesSearch,
  workspaceSearch,
} from './routes'

describe('tabOfPath', () => {
  it('경로의 탭을 돌려주고 모르는 경로는 null 이다', () => {
    expect(tabOfPath('/changes')).toBe('changes')
    expect(tabOfPath('/map')).toBe('map')
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
    expect(parseOntologyQuery('?view=form')).toEqual({ view: 'yaml' })
    expect(parseOntologyQuery('?view=nope&version=x')).toEqual({})
    expect(parseOntologyQuery('')).toEqual({})
  })

  it('기본값은 쓰지 않고 view 와 version 을 순서대로 만든다', () => {
    expect(ontologySearch({ view: 'yaml' })).toBe('?view=yaml')
    expect(ontologySearch({ view: 'history', version: 3 })).toBe('?view=history&version=3')
    expect(ontologySearch({})).toBe('')
  })
})

describe('개념 지도와 더보기', () => {
  it('지도 query 는 쓰고 읽으면 처음 값으로 돌아오고 빈 type 은 쓰지 않는다', () => {
    expect(mapSearch(parseMapQuery('?type=Bottleneck'))).toBe('?type=Bottleneck')
    expect(parseMapQuery('?type=Bottleneck')).toEqual({ type: 'Bottleneck' })
    expect(mapSearch({ type: '' })).toBe('')
    expect(parseMapQuery('')).toEqual({ type: '' })
  })

  it('지도 주소는 로그인 뒤 돌아갈 주소로 받는다', () => {
    expect(isSafeReturnTo('/map?type=X')).toBe(true)
  })

  it('동의 화면 주소는 query 가 붙어도 돌아갈 주소로 받고 비슷한 경로는 받지 않는다', () => {
    expect(isSafeReturnTo('/connect?client_id=x')).toBe(true)
    expect(isSafeReturnTo('/connect')).toBe(true)
    expect(isSafeReturnTo('/connectx')).toBe(false)
    expect(tabOfPath('/connect')).toBeNull()
  })

  it('더보기 항목은 역할에 따라 검토 대기와 사용자가 붙고 연동은 모두에게 붙는다', () => {
    expect(moreItems('VIEWER')).toEqual(['changes', 'ontology', 'tokens', 'proposals', 'trades'])
    expect(moreItems('EDITOR')).toEqual(['changes', 'ontology', 'review', 'tokens', 'proposals', 'trades'])
    expect(moreItems('ADMIN')).toEqual(['changes', 'ontology', 'review', 'users', 'tokens', 'proposals', 'trades'])
    expect(tabOfPath('/tokens')).toBe('tokens')
    expect(tabOfPath('/proposals')).toBe('proposals')
    expect(tabOfPath('/trades')).toBe('trades')
  })

  it('옛 /?node 링크는 지도가 첫 화면이어도 작업 공간 상세로 연다', () => {
    expect(legacyRedirect('/', '?node=a')).toBe('/workspace?node=a&pane=detail')
  })
})

describe('근거 따라가기 주소', () => {
  it('node 를 쓰고 읽으면 처음 값으로 돌아오고 없으면 query 를 쓰지 않는다', () => {
    expect(traceSearch({ node: 'a' })).toBe('?node=a')
    expect(parseTraceQuery('?node=a')).toEqual({ node: 'a' })
    expect(parseTraceQuery(traceSearch({ node: 'a b' }))).toEqual({ node: 'a b' })
    expect(traceSearch({ node: null })).toBe('')
    expect(parseTraceQuery('')).toEqual({ node: null })
    expect(parseTraceQuery('?node=')).toEqual({ node: null })
  })

  it('경로는 trace 탭이고 상단 탭과 더보기 메뉴에는 없다', () => {
    expect(tabOfPath('/trace')).toBe('trace')
    expect(TOP_TABS).not.toContain('trace')
    expect(moreItems('ADMIN')).not.toContain('trace')
  })

  it('로그인 뒤 돌아갈 주소로 받는다', () => {
    expect(isSafeReturnTo('/trace?node=a')).toBe(true)
    expect(isSafeReturnTo('/tracefoo?node=a')).toBe(false)
  })
})

describe('공부 주소', () => {
  it('level 과 page 를 쓰고 읽으면 처음 값으로 돌아온다', () => {
    expect(studySearch({ level: 'LEARNING', page: 2 })).toBe('?level=LEARNING&page=2')
    expect(parseStudyQuery('?level=LEARNING&page=2')).toEqual({ level: 'LEARNING', page: 2 })
  })

  it('기본값이면 query 를 쓰지 않고 모르는 level 은 null 이다', () => {
    expect(studySearch({ level: null, page: 0 })).toBe('')
    expect(parseStudyQuery('')).toEqual({ level: null, page: 0 })
    expect(parseStudyQuery('?level=WRONG')).toEqual({ level: null, page: 0 })
  })

  it('상단 탭의 끝이 공부이고 경로는 /study 다', () => {
    expect(TOP_TABS[TOP_TABS.length - 1]).toBe('study')
    expect(tabOfPath('/study')).toBe('study')
    expect(isSafeReturnTo('/study?level=UNSURE')).toBe(true)
  })
})

describe('내 체결 주소', () => {
  it('ticker 와 page 를 읽고 기본값은 쓰지 않는다', () => {
    expect(parseTradesQuery('?ticker=FLNC&page=1')).toEqual({ ticker: 'FLNC', page: 1 })
    expect(parseTradesQuery('')).toEqual({ ticker: '', page: 0 })
    expect(tradesSearch({ ticker: '', page: 0 })).toBe('')
    expect(tradesSearch({ ticker: 'FLNC', page: 1 })).toBe('?ticker=FLNC&page=1')
  })
})

describe('제안 주소', () => {
  it('status 와 page 를 읽는다', () => {
    expect(parseProposalsQuery('?status=REJECTED&page=2')).toEqual({ status: 'REJECTED', page: 2 })
  })

  it('없거나 모르는 status 는 대기, 쪽은 0 이다', () => {
    expect(parseProposalsQuery('')).toEqual({ status: 'PENDING', page: 0 })
    expect(parseProposalsQuery('?status=NOPE&page=-1')).toEqual({ status: 'PENDING', page: 0 })
  })

  it('기본값은 쓰지 않고 쓰고 읽으면 처음 값으로 돌아온다', () => {
    expect(proposalsSearch({ status: 'PENDING', page: 0 })).toBe('')
    const q = { status: 'ACCEPTED' as const, page: 1 }
    expect(proposalsSearch(q)).toBe('?status=ACCEPTED&page=1')
    expect(parseProposalsQuery(proposalsSearch(q))).toEqual(q)
  })

  it('로그인 뒤 돌아갈 주소로 받는다', () => {
    expect(isSafeReturnTo('/proposals?status=REJECTED')).toBe(true)
  })
})
