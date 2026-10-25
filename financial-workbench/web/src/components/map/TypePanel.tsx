import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, errorMessage } from '../../api/client'
import type { NodeView } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { typeRelationSentences } from '../../lib/relationSentence'
import { DEFAULT_WORKSPACE_QUERY, listSearch, TAB_PATHS, workspaceSearch } from '../../routes'
import { Button } from '@/components/ui/button'
import { TypeBadge } from '../TypeBadge'
import { useAdd } from '../add/AddProvider'

interface Props {
  type: string
  /** 개수를 받지 못했으면 undefined */
  count: number | undefined
  onOpenNode: (id: string) => void
  /** 그 항목의 근거 따라가기를 연다 */
  onTrace: (id: string) => void
}

/** 최근 항목 줄. 이름은 작업 공간에서 상세를 열고, 「근거 따라가기」 는 그 항목의 근거 따라가기를 연다 */
export function RecentItems({ items, onOpenNode, onTrace }: { items: NodeView[]; onOpenNode: (id: string) => void; onTrace: (id: string) => void }) {
  const labels = useLabels()
  return (
    <ul className="mt-1 grid gap-1">
      {items.map((n) => (
        <li key={n.id} className="flex min-w-0 flex-wrap items-center gap-x-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto min-w-0 px-0 py-0 text-left whitespace-normal"
            data-testid="map-recent-item"
            data-node-id={n.id}
            onClick={() => onOpenNode(n.id)}
          >
            {labels.node(n)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="map-recent-trace"
            data-node-id={n.id}
            onClick={() => onTrace(n.id)}
          >
            근거 따라가기
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** 개념 지도에서 고른 타입의 칸. 설명, 최근 항목, 관계 문장, 만들기 창과 다른 화면으로 가는 단추가 있다 */
export function TypePanel({ type, count, onOpenNode, onTrace }: Props) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const navigate = useNavigate()
  const add = useAdd()
  const [recent, setRecent] = useState<NodeView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.nodes
      .search({ types: [type], size: 5, sort: 'recent' })
      .then((p) => !cancelled && setRecent(p.items))
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [type])

  const sentences = typeRelationSentences(ontology, type)

  return (
    <section className="mt-4 min-w-0 rounded-md border bg-background p-3 lg:mt-0" data-testid="map-type-panel" data-type={type}>
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={type} />
        <h3 className="font-bold">{labels.type(type)}</h3>
        {count !== undefined && <span className="text-sm text-muted-foreground">{count}개</span>}
      </div>
      <p className="mt-2 text-sm" data-testid="map-type-description">
        {ontology.nodeTypes[type]?.description}
      </p>

      <h4 className="mt-4 text-sm font-semibold">최근 항목</h4>
      {error && (
        <p className="text-sm text-destructive" data-testid="map-recent-error">
          최근 항목을 불러오지 못했습니다. {error}
        </p>
      )}
      {!error && recent === null && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
      {recent !== null && recent.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="map-recent-empty">
          아직 없습니다
        </p>
      )}
      {recent !== null && recent.length > 0 && (
        <RecentItems items={recent} onOpenNode={onOpenNode} onTrace={onTrace} />
      )}

      {sentences.length > 0 && (
        <>
          <h4 className="mt-4 text-sm font-semibold">관계</h4>
          <ul className="mt-1 grid gap-1 text-sm">
            {sentences.map((s) => (
              <li key={s.key} data-testid="map-relation" data-relationship={s.relationship}>
                {s.text}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && (
          <Button type="button" size="sm" data-testid="map-add-type" onClick={() => add.open(type)}>
            ＋ {labels.type(type)} 추가
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="map-open-list"
          onClick={() => navigate(TAB_PATHS.list + listSearch({ type, q: '', archived: false, page: 0 }))}
        >
          목록에서 보기
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="map-open-workspace"
          onClick={() => navigate(TAB_PATHS.workspace + workspaceSearch({ ...DEFAULT_WORKSPACE_QUERY, types: [type] }))}
        >
          작업 공간에서 보기
        </Button>
      </div>
    </section>
  )
}
