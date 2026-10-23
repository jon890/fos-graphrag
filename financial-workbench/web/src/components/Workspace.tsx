import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../api/client'
import { useLabels } from '../context'
import { EMPTY_GRAPH, graphFromView, mergeGraph, type GraphData } from '../lib/graph'
import { SearchPanel, type SearchFilters } from './SearchPanel'
import { GraphPanel } from './GraphPanel'
import { DetailPanel } from './DetailPanel'
import { parseWorkspaceQuery, workspaceSearch, TAB_PATHS, type WorkspaceQuery } from '../routes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 1024px 미만에서 작업 공간을 나누는 탭 */
export type MobileTab = 'search' | 'graph' | 'detail'

/** 고른 노드가 있으면 상세부터 보여 준다. 다른 탭에서 노드를 열고 들어온 경우다 */
export function initialMobileTab(selectedId: string | null): MobileTab {
  return selectedId ? 'detail' : 'search'
}

/** 주소의 pane 이 있으면 그것을, 없으면 고른 노드로 정한 첫 탭을 쓴다 */
export function mobileTabOf(pane: MobileTab | null, selectedId: string | null): MobileTab {
  return pane ?? initialMobileTab(selectedId)
}

interface Props {
  centerId: string | null
  /** 노드를 다시 고를 때마다 오른다 */
  focusSeq: number
  selectedId: string | null
  /** 그래프 중심과 상세를 함께 바꾼다 */
  onFocus: (id: string) => void
  /** 상세만 바꾼다. 그래프는 그대로 둔다 */
  onSelect: (id: string) => void
  onOpenHistory: (id: string) => void
}

export function Workspace({ centerId, focusSeq, selectedId, onFocus, onSelect, onOpenHistory }: Props) {
  // 타입 목록은 온톨로지에서 온다. 타입이 늘어도 이 화면은 그대로다.
  const labels = useLabels()
  const allTypes = labels.types
  const wide = useMediaQuery('(min-width: 1024px)')
  const location = useLocation()
  const navigate = useNavigate()
  const query = useMemo(() => parseWorkspaceQuery(location.search), [location.search])
  // 주소를 바꾼다. 바꾼 결과가 지금 주소와 같으면 기록도 쌓지 않는다.
  const change = (patch: Partial<WorkspaceQuery>, replace: boolean) => {
    const url = TAB_PATHS.workspace + workspaceSearch({ ...query, ...patch })
    if (url !== location.pathname + location.search) navigate(url, { replace })
  }
  /** 기록을 쌓는다. 좁은 화면 탭 이동에 쓴다 */
  const push = (patch: Partial<WorkspaceQuery>) => change(patch, false)
  /** 주소만 바꾼다. 검색 조건, 홉 수, 주장 보기, 중심 이동에 쓴다 */
  const replace = (patch: Partial<WorkspaceQuery>) => change(patch, true)
  const mobileTab = mobileTabOf(query.pane, selectedId)
  /** 필터가 전체 타입이면 쿼리에서 뺀다. */
  const typesParam = useCallback(
    (types: string[]): string[] | undefined => (types.length === 0 || types.length === allTypes.length ? undefined : types),
    [allTypes],
  )
  const typesKey = query.types?.join(',') ?? ''
  // 렌더마다 새 객체를 만들면 SearchPanel 이 그때마다 다시 검색해 늦게 온 옛 응답이 새 결과를 덮을 수 있다.
  const filters = useMemo<SearchFilters>(
    () => ({
      q: query.q,
      types: typesKey ? typesKey.split(',') : allTypes,
      reviewStatus: query.status as SearchFilters['reviewStatus'],
      includeArchived: query.archived,
    }),
    [query.q, typesKey, query.status, query.archived, allTypes],
  )
  const hops = query.hops
  const claimsAsNodes = query.claimsAsNodes
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  // 상세에서 무언가 바꾸면 올려서 그래프와 검색 결과를 다시 읽게 한다.
  const [changeTick, setChangeTick] = useState(0)
  // 노드를 만든 직후 상세 위에 보일 성공 안내. 다른 노드를 고르면 사라진다.
  const [flash, setFlash] = useState<{ id: string; text: string; kind?: 'success' | 'error' } | null>(null)
  useEffect(() => {
    if (flash && flash.id !== selectedId) setFlash(null)
  }, [flash, selectedId])

  // 배열은 렌더마다 새로 만들어지므로 effect 의존성에는 문자열 키를 쓴다.
  const graphTypesKey = useMemo(() => typesParam(filters.types)?.join(',') ?? '', [typesParam, filters.types])
  const reviewStatus = filters.reviewStatus

  useEffect(() => {
    if (!centerId) {
      setGraph(EMPTY_GRAPH)
      setGraphError(null)
      return
    }
    let cancelled = false
    setGraphLoading(true)
    setGraphError(null)
    api.graph
      .neighborhood({ id: centerId, hops, types: graphTypesKey ? graphTypesKey.split(',') : undefined, reviewStatus })
      .then((view) => {
        if (!cancelled) setGraph(graphFromView(view))
      })
      .catch((e) => {
        if (!cancelled) {
          setGraph(EMPTY_GRAPH)
          setGraphError(errorMessage(e))
        }
      })
      .finally(() => {
        if (!cancelled) setGraphLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [centerId, hops, graphTypesKey, reviewStatus, changeTick, focusSeq])

  const expand = useCallback(
    async (id: string) => {
      setGraphLoading(true)
      setGraphError(null)
      try {
        const view = await api.graph.neighborhood({
          id,
          hops,
          types: graphTypesKey ? graphTypesKey.split(',') : undefined,
          reviewStatus,
        })
        setGraph((prev) => mergeGraph(prev, view))
      } catch (e) {
        setGraphError(errorMessage(e))
      } finally {
        setGraphLoading(false)
      }
    },
    [hops, graphTypesKey, reviewStatus],
  )

  const searchPanel = (
    <SearchPanel
      filters={filters}
      onFiltersChange={(f) =>
        replace({ q: f.q, types: typesParam(f.types) ?? null, status: f.reviewStatus, archived: f.includeArchived })
      }
      selectedId={selectedId}
      onFocus={onFocus}
      onCreated={(node, message, kind) => {
        setFlash({ id: node.id, text: message, kind })
        onFocus(node.id)
      }}
      refreshTick={changeTick}
      typesParam={typesParam}
    />
  )
  const graphPanel = (
    <GraphPanel
      data={graph}
      centerId={centerId}
      selectedId={selectedId}
      loading={graphLoading}
      error={graphError}
      hops={hops}
      onHopsChange={(n) => replace({ hops: n })}
      onSelect={onSelect}
      onExpand={(id) => void expand(id)}
      onRecenter={(id) => replace({ center: id })}
      claimsAsNodes={claimsAsNodes}
      onClaimsAsNodesChange={(on) => replace({ claimsAsNodes: on })}
      visible={wide || mobileTab === 'graph'}
    />
  )
  const detailPanel = (
    <DetailPanel
      selectedId={selectedId}
      flash={flash}
      refreshKey={`${changeTick}:${focusSeq}`}
      onChanged={() => setChangeTick((t) => t + 1)}
      onFocus={onFocus}
      onSelect={onSelect}
      onOpenHistory={onOpenHistory}
    />
  )

  if (wide) {
    return (
      <div className="workspace">
        <aside className="pane pane-left">{searchPanel}</aside>
        <section className="pane pane-center">{graphPanel}</section>
        <aside className="pane pane-right" data-testid="workspace-pane-detail">
          {detailPanel}
        </aside>
      </div>
    )
  }

  const selectedNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) : undefined
  // 고르지 않은 탭도 그려 두고 숨긴다. 상세에서 쓰던 입력이 탭을 옮겨도 남는다.
  const content = 'min-h-0 flex-1 data-[state=inactive]:hidden'
  return (
    <Tabs value={mobileTab} onValueChange={(v) => push({ pane: v as MobileTab })} className="h-full gap-0">
      <TabsList className="w-full shrink-0 rounded-none">
        <TabsTrigger value="search" data-testid="workspace-tab-search">
          검색
        </TabsTrigger>
        <TabsTrigger value="graph" data-testid="workspace-tab-graph">
          그래프
        </TabsTrigger>
        <TabsTrigger value="detail" data-testid="workspace-tab-detail">
          상세
        </TabsTrigger>
      </TabsList>
      <TabsContent value="search" forceMount className={cn('pane', content)}>
        {searchPanel}
      </TabsContent>
      <TabsContent value="graph" forceMount className={cn('pane pane-center overflow-y-auto', content)}>
        {/* 높이가 모자라면 그래프 칸이 줄지 않고 탭 안에서 세로로 스크롤한다 */}
        <div className="min-h-[600px] flex-1">{graphPanel}</div>
        {selectedNode && (
          <div className="flex shrink-0 items-center justify-end border-t bg-card px-3 py-2" data-testid="graph-selection-bar">
            <Button size="sm" className="max-w-full truncate" data-testid="graph-selection-open" onClick={() => push({ pane: 'detail' })}>
              {labels.node(selectedNode)} 상세 보기
            </Button>
          </div>
        )}
      </TabsContent>
      <TabsContent value="detail" forceMount className={cn('pane', content)} data-testid="workspace-pane-detail">
        {detailPanel}
      </TabsContent>
    </Tabs>
  )
}
