import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import type { OntologyPreview, OntologyVersionSummary } from '../../api/types'
import { useApp } from '../../context'
import { applyRemoved, RELOAD_FAILED_HINT, reloadSucceeded } from '../../lib/ontologyDraft'
import type { OntologyDraft } from '../../lib/ontologyEdit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'

interface Props {
  draft: OntologyDraft | null
  onDraftChange: (draft: OntologyDraft | null) => void
  /** GET /api/ontology 를 다시 받아 화면의 온톨로지를 바꾼다 */
  reloadOntology: () => Promise<void>
  /** 저장이 끝났다. 탭이 초안을 지우고 보기 화면으로 돌아간다 */
  onSaved: (saved: OntologyVersionSummary) => void
  /** 초안을 버린 뒤 보기 화면으로 돌아간다 */
  onClose: () => void
  /** 폼 편집기로 옮긴다 */
  onOpenForm: () => void
}

function YamlHelp() {
  return (
    <details className="mb-2 text-sm" data-testid="ontology-yaml-help">
      <summary className="cursor-pointer">키 설명과 쓰는 법</summary>
      <p className="mb-1 mt-2 text-xs text-muted-foreground">
        서버가 정리해서 보여 주는 YAML 이라 주석은 남지 않습니다. 아래는 저장소 YAML 머리 주석에 있던 설명입니다.
      </p>
      <ul className="m-0 list-disc pl-5 text-xs">
        <li>
          <code>label</code>: 화면에 보일 이름입니다. 없으면 화면은 키를 그대로 보입니다.
        </li>
        <li>
          <code>valueLabels</code>: enum 속성의 선택지 표시 이름입니다. 키는 <code>values</code> 에 있는 값이어야 합니다. 저장되는 값은 바뀌지 않습니다.
        </li>
        <li>
          <code>description</code>: 입력칸 바로 아래에 보이는 도움말입니다. 개발 용어 없이 씁니다.
        </li>
        <li>
          <code>valueAliases</code>: enum 속성의 예전 표기입니다. 서버가 시작할 때 목록 밖 값을 이 표를 보고 고칩니다.
        </li>
        <li>
          <code>hintProperties</code>: 검색 결과와 고르기 후보에서 이름 옆에 함께 보일 속성입니다.
        </li>
        <li>
          <code>display</code>: 그래프와 배지의 색(<code>#rrggbb</code>)과 모양(cytoscape 도형 이름)입니다.
        </li>
        <li>
          <code>searchProperties</code>: 이름과 함께 검색어에 넣을 속성입니다.
        </li>
        <li>
          <code>createPicker</code>: 끝(<code>to</code>) 타입 만들기 폼에 시작(<code>from</code>) 노드를 고르는 칸을 더합니다.
        </li>
      </ul>
      <p className="mb-0 mt-2 text-xs">
        YAML 흐름 표기(<code>{'{ ... }'}</code>) 안에서는 쉼표와 콜론이 값을 끊습니다. 쉼표나 콜론이 든 문장은 반드시 따옴표로 감싸세요. 알 수 없는 키가 있으면
        저장 전에 확인에서 오류로 알려 줍니다.
      </p>
    </details>
  )
}

export function OntologyYamlEditor({ draft, onDraftChange, reloadOntology, onSaved, onClose, onOpenForm }: Props) {
  const { ontology } = useApp()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<OntologyPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 초안이 없으면 지금 버전의 YAML 로 만들고, 폼 초안이면 미리보기 API 가 정리한 YAML 로 바꾼다.
  useEffect(() => {
    let live = true
    if (!draft) {
      setLoadError(null)
      api.ontology
        .version(ontology.version)
        .then(
          (detail) =>
            live && onDraftChange({ baseVersion: detail.version, source: 'yaml', yaml: detail.yaml, definition: null, removed: [], dirty: false }),
        )
        .catch((e) => live && setLoadError(errorMessage(e)))
    } else if (draft.source === 'form' && draft.definition) {
      setLoadError(null)
      api.ontology
        .preview({ baseVersion: draft.baseVersion, definition: applyRemoved(draft.definition, draft.removed) })
        .then((p) => {
          if (!live) return
          if (p.yaml === null) setLoadError(p.errors.join('\n') || 'YAML 로 옮기지 못했습니다')
          else onDraftChange({ baseVersion: draft.baseVersion, source: 'yaml', yaml: p.yaml, definition: null, removed: [], dirty: draft.dirty })
        })
        .catch((e) => live && setLoadError(errorMessage(e)))
    }
    return () => {
      live = false
    }
  }, [draft, ontology.version, onDraftChange])

  if (!draft || draft.yaml === null) {
    return loadError ? (
      <Alert role={undefined} variant="destructive" data-testid="ontology-yaml-error">
        <AlertDescription>
          <p className="m-0 whitespace-pre-line">{loadError}</p>
          {draft && (
            <Button type="button" variant="outline" size="sm" className="mt-2" data-testid="ontology-yaml-back-to-form" onClick={onOpenForm}>
              폼으로 돌아가기
            </Button>
          )}
        </AlertDescription>
      </Alert>
    ) : (
      <div className="p-6 text-center text-muted-foreground">YAML 을 불러오는 중…</div>
    )
  }

  const runPreview = async (baseVersion: number, yaml: string) => {
    setBusy(true)
    setPreviewError(null)
    try {
      setPreview(await api.ontology.preview({ baseVersion, yaml }))
    } catch (e) {
      setPreview(null)
      setPreviewError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const restart = async () => {
    if (!(await reloadSucceeded(reloadOntology))) {
      setPreviewError(RELOAD_FAILED_HINT)
      return
    }
    setPreview(null)
    onDraftChange(null)
  }

  const yaml = draft.yaml
  const rebase = (currentVersion: number) => {
    onDraftChange({ ...draft, baseVersion: currentVersion })
    void runPreview(currentVersion, yaml)
  }

  return (
    <div data-testid="ontology-yaml-editor">
      <p className="mb-2 mt-0 text-sm text-muted-foreground">버전 {draft.baseVersion} 에서 시작한 초안입니다. 저장 전에 확인으로 바뀐 점과 영향을 보세요.</p>
      <YamlHelp />
      <Textarea
        className="min-h-96 font-mono text-xs"
        data-testid="ontology-yaml-input"
        spellCheck={false}
        value={yaml}
        onChange={(e) => {
          setPreview(null)
          onDraftChange({ ...draft, yaml: e.target.value, dirty: true })
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" data-testid="ontology-preview" disabled={busy} onClick={() => void runPreview(draft.baseVersion, yaml)}>
          저장 전에 확인
        </Button>
        <Button type="button" variant="outline" data-testid="ontology-yaml-to-form" onClick={onOpenForm}>
          폼으로 보기
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
      {preview && (
        <OntologyPreviewPanel
          preview={preview}
          onSave={({ note, confirm }) =>
            api.ontology.save({ baseVersion: draft.baseVersion, yaml, note: note || undefined, confirm })
          }
          onSaved={onSaved}
          onRestart={() => void restart()}
          onRebase={rebase}
        />
      )}
    </div>
  )
}
