import { useEffect, useRef, useState } from 'react'
import { api, errorMessage, ONTOLOGY_EXPORT_URL } from '../../api/client'
import type { OntologyPreview, OntologyVersionSummary } from '../../api/types'
import { useApp } from '../../context'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { RELOAD_FAILED_HINT, reloadSucceeded } from '../../lib/ontologyDraft'
import type { OntologyDraft } from '../../lib/ontologyEdit'
import { lineRange } from '../../lib/yamlLines'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  /** 초안은 그대로 두고 버전 기록으로 간다 */
  onOpenHistory: () => void
}

const MIN_HEIGHT = 320
// textarea 의 leading-5 와 같다. 계산된 줄 높이를 읽지 못할 때만 쓴다
const FALLBACK_LINE_HEIGHT = 20

function YamlHelpBody() {
  return (
    <>
      <p className="m-0 text-xs text-muted-foreground">
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
        <li>
          <code>sentence</code>: 주장 종류(<code>claimPredicates</code>)에서는 주장 만들기 폼의 문장 틀입니다. <code>{'{subject}'}</code>,{' '}
          <code>{'{object}'}</code> 자리에 고르기 칸이 들어갑니다. 관계 종류(<code>relationshipTypes</code>)에서는 <code>{'{from}'}</code>,{' '}
          <code>{'{to}'}</code> 를 한 번씩 담는 한다체 문장입니다. 화면이 끝을 합니다체로 바꾸고 조사를 이름에 맞춰 고릅니다. 없으면 「
          {'{from}'}이(가) {'{to}'}을(를) 표시 이름」 으로 보입니다.
        </li>
      </ul>
      <p className="m-0 text-xs">
        YAML 흐름 표기(<code>{'{ ... }'}</code>) 안에서는 쉼표와 콜론이 값을 끊습니다. 쉼표나 콜론이 든 문장은 반드시 따옴표로 감싸세요. 알 수 없는 키가 있으면
        저장 전에 확인에서 오류로 알려 줍니다.
      </p>
    </>
  )
}

export function OntologyYamlEditor({ draft, onDraftChange, reloadOntology, onSaved, onClose, onOpenHistory }: Props) {
  const { ontology } = useApp()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<OntologyPreview | null>(null)
  // 결과가 올 때마다 하나씩 늘려 좁은 화면의 접힘 칸을 다시 펼친다
  const [previewRun, setPreviewRun] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [height, setHeight] = useState<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const hasDraft = draft !== null

  // 초안이 없으면 지금 버전의 YAML 로 만든다.
  useEffect(() => {
    if (hasDraft) return
    let live = true
    setLoadError(null)
    api.ontology
      .version(ontology.version)
      .then((detail) => live && onDraftChange({ baseVersion: detail.version, yaml: detail.yaml, dirty: false }))
      .catch((e) => live && setLoadError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [hasDraft, ontology.version, onDraftChange])

  // 편집기 윗변부터 창 아랫변까지가 높이다. 머리글 높이가 화면 폭에 따라 달라서 CSS 로 짐작하지 않고 재서 쓴다.
  useEffect(() => {
    if (!hasDraft) return
    const measure = () => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0
      setHeight(Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [hasDraft])

  if (!draft) {
    return loadError ? (
      <Alert role={undefined} variant="destructive" data-testid="ontology-yaml-error">
        <AlertDescription>
          <p className="m-0 whitespace-pre-line">{loadError}</p>
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
      setPreviewRun((n) => n + 1)
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

  const discard = () => {
    setPreview(null)
    onDraftChange(null)
    onClose()
  }

  const goToLine = (line: number) => {
    const input = inputRef.current
    if (!input) return
    const { start, end } = lineRange(input.value, line)
    const lastLine = input.value.split('\n').length
    const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || FALLBACK_LINE_HEIGHT
    input.focus()
    input.setSelectionRange(start, end)
    input.scrollTop = Math.max(0, (Math.min(line, lastLine) - 1) * lineHeight - input.clientHeight / 3)
    if (gutterRef.current) gutterRef.current.scrollTop = input.scrollTop
  }

  const yaml = draft.yaml
  const rebase = (currentVersion: number) => {
    onDraftChange({ ...draft, baseVersion: currentVersion })
    void runPreview(currentVersion, yaml)
  }
  const lineNumbers = Array.from({ length: yaml.split('\n').length }, (_, i) => i + 1).join('\n')

  const panel = preview && (
    <OntologyPreviewPanel
      preview={preview}
      onSave={({ note, confirm }) => api.ontology.save({ baseVersion: draft.baseVersion, yaml, note: note || undefined, confirm })}
      onSaved={onSaved}
      onRestart={() => void restart()}
      onRebase={rebase}
      onGoToLine={goToLine}
    />
  )

  return (
    <div
      ref={rootRef}
      className="flex min-h-80 flex-col"
      style={height === null ? undefined : { height }}
      data-testid="ontology-yaml-editor"
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-card pb-2" data-testid="ontology-yaml-toolbar">
        <Button type="button" data-testid="ontology-preview" disabled={busy} onClick={() => void runPreview(draft.baseVersion, yaml)}>
          저장 전에 확인
        </Button>
        <Button type="button" variant="outline" data-testid="ontology-draft-discard" onClick={() => (draft.dirty ? setDiscardOpen(true) : discard())}>
          초안 버리기
        </Button>
        <Button type="button" variant="outline" data-testid="ontology-toolbar-history" onClick={onOpenHistory}>
          버전 기록
        </Button>
        <Button asChild variant="outline">
          <a data-testid="ontology-toolbar-export" href={ONTOLOGY_EXPORT_URL} download>
            YAML 내려받기
          </a>
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="ontology-draft-status" data-dirty={String(draft.dirty)}>
          버전 {draft.baseVersion} 에서 시작{draft.dirty && ' · 고침'}
        </span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" data-testid="ontology-yaml-help-open" onClick={() => setHelpOpen(true)}>
          키 설명
        </Button>
      </div>

      <div className={wide ? 'grid min-h-0 flex-1 grid-cols-[1fr_400px] gap-3 pt-2' : 'flex min-h-0 flex-1 flex-col gap-2 overflow-auto pt-2'}>
        <div className={wide ? 'flex min-h-0 flex-col gap-2' : 'flex min-h-64 flex-1 flex-col gap-2'}>
          {previewError && (
            <Alert role={undefined} variant="destructive" data-testid="ontology-preview-failed">
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border">
            <div
              ref={gutterRef}
              aria-hidden="true"
              className="w-12 shrink-0 select-none overflow-hidden whitespace-pre bg-muted py-2 pb-6 pr-2 text-right font-mono text-xs leading-5 text-muted-foreground"
              data-testid="ontology-yaml-gutter"
            >
              {lineNumbers}
            </div>
            <textarea
              ref={inputRef}
              wrap="off"
              spellCheck={false}
              className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre border-0 bg-transparent px-2 py-2 font-mono text-xs leading-5 outline-none"
              data-testid="ontology-yaml-input"
              value={yaml}
              onChange={(e) => {
                setPreview(null)
                onDraftChange({ ...draft, yaml: e.target.value, dirty: true })
              }}
              onScroll={(e) => {
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
              }}
            />
          </div>
        </div>
        {panel &&
          (wide ? (
            <div className="min-h-0 overflow-auto" data-testid="ontology-preview-side" data-layout="side">
              {panel}
            </div>
          ) : (
            <details key={previewRun} open data-testid="ontology-preview-side" data-layout="below">
              <summary className="cursor-pointer text-sm font-bold">저장 전에 확인 결과</summary>
              {panel}
            </details>
          ))}
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto" data-testid="ontology-yaml-help">
          <DialogHeader>
            <DialogTitle>키 설명과 쓰는 법</DialogTitle>
            <DialogDescription>YAML 에서 쓰는 키의 뜻입니다.</DialogDescription>
          </DialogHeader>
          <YamlHelpBody />
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent data-testid="ontology-discard-confirm">
          <DialogHeader>
            <DialogTitle>고친 내용을 버릴까요?</DialogTitle>
            <DialogDescription>버린 초안은 되살릴 수 없습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" data-testid="ontology-discard-confirm-cancel">
                취소
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              data-testid="ontology-discard-confirm-submit"
              onClick={() => {
                setDiscardOpen(false)
                discard()
              }}
            >
              버리기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
