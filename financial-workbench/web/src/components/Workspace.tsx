import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useLabels } from '../context'
import { EMPTY_GRAPH, graphFromView, mergeGraph, type GraphData } from '../lib/graph'
import { SearchPanel, type SearchFilters } from './SearchPanel'
import { GraphPanel } from './GraphPanel'
import { DetailPanel } from './DetailPanel'

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
  const allTypes = useLabels().types
  /** 필터가 전체 타입이면 쿼리에서 뺀다. */
  const typesParam = useCallback(
    (types: string[]): string[] | undefined => (types.length === 0 || types.length === allTypes.length ? undefined : types),
    [allTypes],
  )
  const [filters, setFilters] = useState<SearchFilters>({ q: '', types: allTypes, reviewStatus: '', includeArchived: false })
  const [hops, setHops] = useState(1)
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  // 상세에서 무언가 바꾸면 올려서 그래프와 검색 결과를 다시 읽게 한다.
  const [changeTick, setChangeTick] = useState(0)
  // 노드를 만든 직후 상세 위에 보일 성공 안내. 다른 노드를 고르면 사라진다.
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null)
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

  return (
    <div className="workspace">
      <aside className="pane pane-left">
        <SearchPanel
          filters={filters}
          onFiltersChange={setFilters}
          selectedId={selectedId}
          onFocus={onFocus}
          onCreated={(node, message) => {
            setFlash({ id: node.id, text: message })
            onFocus(node.id)
          }}
          refreshTick={changeTick}
          typesParam={typesParam}
        />
      </aside>
      <section className="pane pane-center">
        <GraphPanel
          data={graph}
          centerId={centerId}
          selectedId={selectedId}
          loading={graphLoading}
          error={graphError}
          hops={hops}
          onHopsChange={setHops}
          onSelect={onSelect}
          onExpand={(id) => void expand(id)}
          onRecenter={onFocus}
        />
      </section>
      <aside className="pane pane-right">
        <DetailPanel
          selectedId={selectedId}
          flash={flash}
          refreshKey={`${changeTick}:${focusSeq}`}
          onChanged={() => setChangeTick((t) => t + 1)}
          onFocus={onFocus}
          onSelect={onSelect}
          onOpenHistory={onOpenHistory}
        />
      </aside>
    </div>
  )
}
