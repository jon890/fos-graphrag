import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import type {
  OntologyImpact,
  OntologyPreview,
  ProposalView,
} from '../../api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OntologyDiffSummary } from '../ontology/OntologyPreviewPanel'

/** 온톨로지 변경 제안이 담은 YAML 과 기준 버전. payload 의 모양은 docs/api-contract.md 「제안 내용」 */
function ontologyPayload(p: ProposalView): {
  baseVersion: number
  yaml: string
  note: string
} {
  const { baseVersion, yaml, note } = p.payload
  return {
    baseVersion: typeof baseVersion === 'number' ? baseVersion : 0,
    yaml: typeof yaml === 'string' ? yaml : '',
    note: typeof note === 'string' ? note : '',
  }
}

export interface OntologyPreviewState {
  preview: OntologyPreview | null
  /** 화면에 그리는 영향. 승인이 `ONTOLOGY_IMPACT_UNCONFIRMED` 로 돌려준 영향으로 바뀔 수 있다 */
  impacts: OntologyImpact[]
  error: string | null
  setImpacts: (impacts: OntologyImpact[]) => void
  reload: () => void
}

/**
 * 승인할 ADMIN 에게 지금 버전과 비교한 바뀐 점과 영향을 받아 온다. enabled 가 아니면 부르지 않는다.
 * initial 을 주면 요청 없이 그 결과를 쓴다(서버 렌더링 테스트가 useEffect 를 돌리지 못해서다)
 */
export function useOntologyPreview(
  p: ProposalView,
  enabled: boolean,
  initial?: OntologyPreview,
): OntologyPreviewState {
  const { baseVersion, yaml } = ontologyPayload(p)
  const [preview, setPreview] = useState<OntologyPreview | null>(
    initial ?? null,
  )
  const [impacts, setImpacts] = useState<OntologyImpact[]>(
    initial?.impacts ?? [],
  )
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await api.ontology.preview({ baseVersion, yaml })
      setPreview(next)
      setImpacts(next.impacts)
    } catch (e) {
      setPreview(null)
      setError(errorMessage(e))
    }
  }, [baseVersion, yaml])

  useEffect(() => {
    if (enabled && !initial) void load()
  }, [enabled, initial, load])

  return { preview, impacts, error, setImpacts, reload: () => void load() }
}

interface Props {
  proposal: ProposalView
  /** 기준 버전과 지금 버전이 다를 때 보일 지금 버전. 같으면 null */
  staleAgainst: number | null
  /** ADMIN 이 대기 중인 카드만 미리보기를 보인다 */
  showPreview: boolean
  state: OntologyPreviewState
  confirmed: boolean
  onConfirm: (confirmed: boolean) => void
}

/** 온톨로지 변경 카드의 본문. 메모, YAML 보기, 바뀐 점과 영향, 기준 버전 안내, 확인란이다 */
export function OntologyChangeCard({
  proposal: p,
  staleAgainst,
  showPreview,
  state,
  confirmed,
  onConfirm,
}: Props) {
  const { baseVersion, yaml, note } = ontologyPayload(p)
  const lineNumbers = Array.from(
    { length: yaml.split('\n').length },
    (_, i) => i + 1,
  ).join('\n')

  return (
    <div className="grid gap-2 text-sm">
      {note && (
        <p className="m-0 whitespace-pre-wrap break-words">메모: {note}</p>
      )}

      <details data-testid="proposal-ontology-yaml">
        <summary className="cursor-pointer">YAML 보기</summary>
        <div className="mt-1 flex max-h-96 overflow-hidden rounded-md border">
          <div
            aria-hidden="true"
            className="w-12 shrink-0 select-none overflow-hidden whitespace-pre bg-muted py-2 pr-2 text-right font-mono text-xs leading-5 text-muted-foreground"
          >
            {lineNumbers}
          </div>
          <pre className="m-0 min-w-0 flex-1 overflow-auto px-2 py-2 font-mono text-xs leading-5">
            {yaml}
          </pre>
        </div>
      </details>

      {staleAgainst !== null && (
        <Alert
          role={undefined}
          variant="destructive"
          data-testid="proposal-ontology-stale"
        >
          <AlertDescription>
            기준 버전이 바뀌었습니다(제안 버전 {baseVersion}, 지금 버전{' '}
            {staleAgainst}). 아래는 지금 버전과 비교한 바뀐 점이라 그 사이의
            변경이 「뺌」 이나 「바뀜」 으로 보일 수 있습니다. 에이전트에게 지금
            버전에서 다시 만들어 달라고 하거나 거절하세요.
          </AlertDescription>
        </Alert>
      )}

      {showPreview && state.preview && (
        <div data-testid="proposal-ontology-preview">
          {state.preview.valid ? (
            <OntologyDiffSummary
              preview={state.preview}
              impacts={state.impacts}
            />
          ) : (
            <ul className="m-0 list-disc pl-5 text-red-700">
              {state.preview.errors.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showPreview && state.error && (
        <Alert
          role={undefined}
          variant="destructive"
          data-testid="proposal-ontology-preview-error"
        >
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {state.error}
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="proposal-ontology-preview-retry"
              onClick={state.reload}
            >
              다시 확인
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showPreview && state.impacts.length > 0 && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="proposal-ontology-confirm"
            checked={confirmed}
            onChange={(e) => onConfirm(e.target.checked)}
          />
          기존 데이터와 어긋나는 것을 알고 승인합니다
        </label>
      )}
    </div>
  )
}
