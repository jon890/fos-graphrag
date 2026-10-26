import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import type { OntologyDefinition, OntologyPreview, OntologyVersionSummary } from '../../api/types'
import { useApp } from '../../context'
import {
  applyRemoved,
  toDefinition,
  toggleRemoved,
  RELOAD_FAILED_HINT,
  reloadSucceeded,
} from '../../lib/ontologyDraft'
import type { OntologyDraft } from '../../lib/ontologyEdit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'
import { AddNodeTypePanel, NodeTypeCard } from './form/NodeTypeSection'
import { AddPredicatePanel, PredicateRow } from './form/PredicateSection'
import { AddRelationshipPanel, RelationshipRow } from './form/RelationshipSection'
import type { FormContext } from './form/shared'

interface Props {
  draft: OntologyDraft | null
  onDraftChange: (draft: OntologyDraft | null) => void
  /** GET /api/ontology 를 다시 받아 화면의 온톨로지를 바꾼다 */
  reloadOntology: () => Promise<void>
  /** 저장이 끝났다. 탭이 초안을 지우고 보기 화면으로 돌아간다 */
  onSaved: (saved: OntologyVersionSummary) => void
  /** 초안을 버린 뒤 보기 화면으로 돌아간다 */
  onClose: () => void
  /** YAML 편집기로 옮긴다 */
  onOpenYaml: () => void
}


export function OntologyFormEditor({ draft, onDraftChange, reloadOntology, onSaved, onClose, onOpenYaml }: Props) {
  const { ontology } = useApp()
  const [convertErrors, setConvertErrors] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<OntologyPreview | null>(null)
  /** 미리보기에 보낸 정의. 저장 요청에도 이 정의를 그대로 쓴다 */
  const [sent, setSent] = useState<OntologyDefinition | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 초안이 없으면 지금 온톨로지로 만들고, YAML 초안이면 미리보기 API 가 정리한 정의로 바꾼다.
  useEffect(() => {
    if (!draft) {
      onDraftChange({ baseVersion: ontology.version, source: 'form', yaml: null, definition: toDefinition(ontology), removed: [], dirty: false })
      return
    }
    if (draft.source !== 'yaml' || draft.yaml === null) return
    let live = true
    setConvertErrors(null)
    api.ontology
      .preview({ baseVersion: draft.baseVersion, yaml: draft.yaml })
      .then((p) => {
        if (!live) return
        if (p.definition) onDraftChange({ baseVersion: draft.baseVersion, source: 'form', yaml: null, definition: p.definition, removed: [], dirty: draft.dirty })
        else setConvertErrors(p.errors)
      })
      .catch((e) => live && setConvertErrors([errorMessage(e)]))
    return () => {
      live = false
    }
  }, [draft, ontology, onDraftChange])

  if (convertErrors && draft?.source === 'yaml') {
    return (
      <Alert role={undefined} variant="destructive" data-testid="ontology-form-convert-error">
        <AlertDescription>
          <p className="m-0 font-bold">YAML 에 오류가 있어 폼으로 옮기지 못했습니다</p>
          <ul className="m-0 list-disc pl-5">
            {convertErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="mt-2" data-testid="ontology-form-back-to-yaml" onClick={onOpenYaml}>
            YAML 로 돌아가기
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (!draft || draft.source !== 'form' || !draft.definition) {
    return <div className="p-6 text-center text-muted-foreground">폼을 준비하는 중…</div>
  }

  const def = draft.definition
  const effective = applyRemoved(def, draft.removed)
  const ctx: FormContext = {
    def,
    removed: draft.removed,
    effective,
    typeKeys: Object.entries(def.nodeTypes)
      .filter(([, t]) => !t.managedBy)
      .map(([k]) => k),
    change: (next) => {
      setPreview(null)
      onDraftChange({ ...draft, definition: next, dirty: true })
    },
    toggle: (path) => {
      setPreview(null)
      onDraftChange({ ...draft, removed: toggleRemoved(draft.removed, path), dirty: true })
    },
  }

  const request = async (): Promise<{ sentDefinition: OntologyDefinition; result: OntologyPreview } | null> => {
    setBusy(true)
    setPreviewError(null)
    try {
      const sentDefinition = applyRemoved(def, draft.removed)
      return { sentDefinition, result: await api.ontology.preview({ baseVersion: draft.baseVersion, definition: sentDefinition }) }
    } catch (e) {
      setPreview(null)
      setPreviewError(errorMessage(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const runPreview = async () => {
    const response = await request()
    if (!response) return
    setSent(response.sentDefinition)
    setPreview(response.result)
  }

  const toYaml = async () => {
    const response = await request()
    if (!response) return
    const { yaml, errors } = response.result
    if (yaml === null) {
      setPreviewError(`YAML 로 옮기지 못했습니다: ${errors.join(', ')}`)
      return
    }
    onDraftChange({ baseVersion: draft.baseVersion, source: 'yaml', yaml, definition: null, removed: [], dirty: draft.dirty })
    onOpenYaml()
  }

  const restart = async () => {
    if (!(await reloadSucceeded(reloadOntology))) {
      setPreviewError(RELOAD_FAILED_HINT)
      return
    }
    setPreview(null)
    onDraftChange(null)
  }

  const rebase = (currentVersion: number) => {
    onDraftChange({ ...draft, baseVersion: currentVersion })
    void (async () => {
      setBusy(true)
      try {
        const body = sent ?? applyRemoved(def, draft.removed)
        setPreview(await api.ontology.preview({ baseVersion: currentVersion, definition: body }))
      } catch (e) {
        setPreview(null)
        setPreviewError(errorMessage(e))
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div data-testid="ontology-form">
      <p className="mb-3 mt-0 text-sm text-muted-foreground">
        버전 {draft.baseVersion} 에서 시작한 초안입니다. 그 밖의 항목(검색 속성, 힌트 속성, enum 예전 표기 등)은 YAML 편집기에서 고칩니다.
      </p>

      <h3 className="mb-2 mt-4 text-[15px] font-bold">노드 타입</h3>
      {ctx.typeKeys.map((type) => (
        <NodeTypeCard key={type} ctx={ctx} type={type} />
      ))}
      <AddNodeTypePanel ctx={ctx} />

      <h3 className="mb-2 mt-6 text-[15px] font-bold">관계 종류</h3>
      {Object.keys(def.relationshipTypes).map((key) => (
        <RelationshipRow key={key} ctx={ctx} relKey={key} />
      ))}
      <AddRelationshipPanel ctx={ctx} />

      <h3 className="mb-2 mt-6 text-[15px] font-bold">주장 종류</h3>
      {Object.keys(def.claimPredicates).map((key) => (
        <PredicateRow key={key} ctx={ctx} predicateKey={key} />
      ))}
      <AddPredicatePanel ctx={ctx} />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" data-testid="ontology-preview" disabled={busy} onClick={() => void runPreview()}>
          저장 전에 확인
        </Button>
        <Button type="button" variant="outline" data-testid="ontology-form-to-yaml" disabled={busy} onClick={() => void toYaml()}>
          YAML 로 보기
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="ontology-draft-discard"
          onClick={() => {
            setPreview(null)
            onDraftChange(null)
            onClose()
          }}
        >
          초안 버리기
        </Button>
      </div>
      {previewError && (
        <Alert role={undefined} variant="destructive" className="mt-3" data-testid="ontology-preview-failed">
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      )}
      {preview && sent && (
        <OntologyPreviewPanel
          preview={preview}
          onSave={({ note, confirm }) => api.ontology.save({ baseVersion: draft.baseVersion, definition: sent, note: note || undefined, confirm })}
          onSaved={onSaved}
          onRestart={() => void restart()}
          onRebase={rebase}
        />
      )}
    </div>
  )
}
