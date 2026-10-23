import { useEffect, useState } from 'react'
import { api, errorMessage, ontologyVersionDownload } from '../../api/client'
import type { OntologyPreview, OntologyVersionDetail, OntologyVersionSummary, Page } from '../../api/types'
import { useApp } from '../../context'
import { formatDateTime, userName } from '../../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Pager } from '../Pager'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'

interface Props {
  /** 열린 버전. 주소의 version */
  version: number | undefined
  onOpenVersion: (version: number) => void
  reloadOntology: () => Promise<void>
  onSaved: (saved: OntologyVersionSummary) => void
}

export function OntologyHistory({ version, onOpenVersion, reloadOntology, onSaved }: Props) {
  const { ontology } = useApp()
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<OntologyVersionSummary> | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [detail, setDetail] = useState<OntologyVersionDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [preview, setPreview] = useState<OntologyPreview | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setListError(null)
    api.ontology
      .versions(pageNo)
      .then((p) => live && setPage(p))
      .catch((e) => live && setListError(errorMessage(e)))
    return () => {
      live = false
    }
    // 새 버전이 저장되면(ontology.version) 목록도 다시 읽는다.
  }, [pageNo, ontology.version])

  useEffect(() => {
    setPreview(null)
    setActionError(null)
    setDetail(null)
    setDetailError(null)
    if (version === undefined) return
    let live = true
    api.ontology
      .version(version)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setDetailError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [version])

  const startRestore = async () => {
    if (!detail) return
    setBusy(true)
    setActionError(null)
    try {
      setPreview(await api.ontology.preview({ baseVersion: ontology.version, yaml: detail.yaml }))
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    if (!detail) return
    try {
      await ontologyVersionDownload(detail.version)
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  return (
    <div data-testid="ontology-history">
      {listError && (
        <Alert role={undefined} variant="destructive" className="mb-2">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>버전</TableHead>
            <TableHead>시각</TableHead>
            <TableHead>저장한 사람</TableHead>
            <TableHead>메모</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page?.items.map((v) => (
            <TableRow
              key={v.version}
              className="cursor-pointer"
              data-testid="ontology-history-row"
              data-version={v.version}
              data-state={v.version === version ? 'selected' : undefined}
              onClick={() => onOpenVersion(v.version)}
            >
              <TableCell>{v.version}</TableCell>
              <TableCell>{formatDateTime(v.createdAt)}</TableCell>
              <TableCell>{userName(v.createdBy)}</TableCell>
              <TableCell>
                {v.note ?? ''}
                {v.restoredFrom !== null && <span className="text-muted-foreground"> 버전 {v.restoredFrom} 으로 되돌림</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="ontology-history-pager" />}

      {detailError && (
        <Alert role={undefined} variant="destructive" className="mt-3">
          <AlertDescription>{detailError}</AlertDescription>
        </Alert>
      )}
      {detail && (
        <section className="mt-4" data-testid="ontology-history-detail">
          <h3 className="m-0 mb-2 text-[15px] font-bold">버전 {detail.version}</h3>
          <Textarea className="min-h-96 font-mono text-xs" data-testid="ontology-history-yaml" readOnly spellCheck={false} value={detail.yaml} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" data-testid="ontology-history-download" onClick={() => void download()}>
              이 버전 내려받기
            </Button>
            {detail.version !== ontology.version && (
              <Button type="button" data-testid="ontology-restore" disabled={busy} onClick={() => void startRestore()}>
                이 버전으로 되돌리기
              </Button>
            )}
          </div>
          {actionError && (
            <Alert role={undefined} variant="destructive" className="mt-3">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {preview && (
            <OntologyPreviewPanel
              preview={preview}
              onSave={({ note, confirm }) =>
                api.ontology.restore(detail.version, { baseVersion: ontology.version, note: note || undefined, confirm })
              }
              onSaved={onSaved}
              onRestart={() => {
                setPreview(null)
                void reloadOntology()
              }}
            />
          )}
        </section>
      )}
    </div>
  )
}
