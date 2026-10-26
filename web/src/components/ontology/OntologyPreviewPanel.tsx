import { useEffect, useState } from 'react'
import { ApiError, errorMessage } from '../../api/client'
import type { OntologyImpact, OntologyPreview, OntologyVersionSummary } from '../../api/types'
import { impactText } from '../../lib/ontologyEdit'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  preview: OntologyPreview
  /** 저장이나 되돌리기 요청을 보낸다. 실패하면 ApiError 를 던진다 */
  onSave: (opts: { note: string; confirm: boolean }) => Promise<OntologyVersionSummary>
  onSaved: (saved: OntologyVersionSummary) => void
  /** 다른 관리자가 먼저 저장했을 때 「최신 버전에서 다시 시작」 */
  onRestart: () => void
  /** 다른 관리자가 먼저 저장했을 때 「내 초안을 최신 버전 위에 저장」. 초안 편집기만 넘긴다 */
  onRebase?: (currentVersion: number) => void
}

const NOTE_MAX = 1000

function DiffList({ testId, title, paths }: { testId: string; title: string; paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <div className="mb-2">
      <h4 className="m-0 mb-1 text-sm font-bold">{title}</h4>
      <ul className="m-0 list-disc pl-5 font-mono text-xs" data-testid={testId}>
        {paths.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function detailsErrors(e: ApiError): string[] {
  const errors = e.details?.errors
  return Array.isArray(errors) ? errors.map(String) : [e.message]
}

export function OntologyPreviewPanel({ preview, onSave, onSaved, onRestart, onRebase }: Props) {
  const [impacts, setImpacts] = useState<OntologyImpact[]>(preview.impacts)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [conflictVersion, setConflictVersion] = useState<number | null>(null)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setImpacts(preview.impacts)
    setConfirm(false)
    setConflictVersion(null)
    setSaveErrors([])
    setError(null)
  }, [preview])

  if (!preview.valid) {
    return (
      <section className="mt-3" data-testid="ontology-preview-panel">
        <Alert role={undefined} variant="destructive">
          <AlertDescription>
            <p className="m-0 font-bold">YAML 에 고칠 곳이 있습니다. 고친 뒤 다시 확인하세요.</p>
            <ul className="m-0 list-disc pl-5">
              {preview.errors.map((message, i) => (
                <li key={i} data-testid="ontology-preview-error">
                  {message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  const hasChanges = preview.added.length + preview.removed.length + preview.changed.length > 0

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaveErrors([])
    try {
      const saved = await onSave({ note: note.trim(), confirm })
      onSaved(saved)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ONTOLOGY_IMPACT_UNCONFIRMED') {
        const latest = e.details?.impacts
        if (Array.isArray(latest)) setImpacts(latest as OntologyImpact[])
        setConfirm(false)
        setError('그 사이 데이터가 바뀌어 영향이 달라졌습니다. 영향을 다시 읽고 확인한 뒤 저장하세요.')
      } else if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {
        setConflictVersion(Number(e.details?.currentRevision))
      } else if (e instanceof ApiError && e.code === 'ONTOLOGY_INVALID') {
        setSaveErrors(detailsErrors(e))
      } else {
        setError(errorMessage(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-3 rounded-md border p-3" data-testid="ontology-preview-panel">
      <h3 className="m-0 mb-2 text-[15px] font-bold">저장 전에 확인</h3>
      {hasChanges ? (
        <>
          <DiffList testId="ontology-diff-added" title="더함" paths={preview.added} />
          <DiffList testId="ontology-diff-removed" title="뺌" paths={preview.removed} />
          <DiffList testId="ontology-diff-changed" title="바뀜" paths={preview.changed} />
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground" data-testid="ontology-diff-empty">
          바뀐 점이 없습니다
        </p>
      )}

      {impacts.length > 0 && (
        <div className="mt-2">
          <h4 className="m-0 mb-1 text-sm font-bold">기존 데이터에 미치는 영향</h4>
          <ul className="m-0 list-disc pl-5 text-sm">
            {impacts.map((impact) => (
              <li key={`${impact.path}:${impact.kind}`} data-testid="ontology-impact" data-kind={impact.kind}>
                <span className="font-mono text-xs">{impact.path}</span> {impactText(impact.kind, impact.count)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.codeOwnedIgnored.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="m-0">서버 코드가 정하는 항목이라 저장소 값으로 둡니다</p>
          <ul className="m-0 list-disc pl-5 font-mono text-xs">
            {preview.codeOwnedIgnored.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {saveErrors.length > 0 && (
        <Alert role={undefined} variant="destructive" className="mt-3">
          <AlertDescription>
            <ul className="m-0 list-disc pl-5">
              {saveErrors.map((message, i) => (
                <li key={i} data-testid="ontology-preview-error">
                  {message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert role={undefined} variant="destructive" className="mt-3" data-testid="ontology-save-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {conflictVersion !== null && (
        <Alert role={undefined} className="mt-3" data-testid="ontology-conflict">
          <AlertDescription>
            <p className="m-0">다른 관리자가 버전 {conflictVersion} 을 저장했습니다.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" data-testid="ontology-conflict-restart" onClick={onRestart}>
                최신 버전에서 다시 시작
              </Button>
              {onRebase && (
                <Button type="button" variant="outline" size="sm" data-testid="ontology-conflict-rebase" onClick={() => onRebase(conflictVersion)}>
                  내 초안을 최신 버전 위에 저장
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {hasChanges && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            메모(선택)
            <Input data-testid="ontology-save-note" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {impacts.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="ontology-save-confirm"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              기존 데이터와 어긋나는 것을 알고 저장합니다
            </label>
          )}
          <div>
            <Button type="button" data-testid="ontology-save" disabled={busy || (impacts.length > 0 && !confirm)} onClick={() => void save()}>
              저장
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
