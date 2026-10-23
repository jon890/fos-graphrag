import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ONTOLOGY_EXPORT_URL } from '../../api/client'
import type { OntologyVersionSummary } from '../../api/types'
import { useApp } from '../../context'
import { formatDateTime, userName } from '../../lib/format'
import type { OntologyDraft } from '../../lib/ontologyEdit'
import { TAB_PATHS, ontologySearch, parseOntologyQuery, type OntologyQuery } from '../../routes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OntologyHistory } from './OntologyHistory'
import { OntologyView } from './OntologyView'
import { OntologyYamlEditor } from './OntologyYamlEditor'

interface Props {
  draft: OntologyDraft | null
  onDraftChange: (draft: OntologyDraft | null) => void
  /** GET /api/ontology 를 다시 받아 화면의 온톨로지를 바꾼다 */
  reloadOntology: () => Promise<void>
}

export function OntologyTab({ draft, onDraftChange, reloadOntology }: Props) {
  const { ontology, user } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const isAdmin = user.role === 'ADMIN'
  // ADMIN 이 아니면 주소에 view 가 있어도 지금 버전 보기만 보인다. App 이 주소도 바꿔 연다.
  const query: OntologyQuery = isAdmin ? parseOntologyQuery(location.search) : {}

  const open = (q: OntologyQuery) => {
    setMessage(null)
    navigate(TAB_PATHS.ontology + ontologySearch(q))
  }

  const saved = async (summary: OntologyVersionSummary) => {
    await reloadOntology()
    onDraftChange(null)
    navigate(TAB_PATHS.ontology)
    setMessage(`버전 ${summary.version} 을 저장했습니다.`)
  }

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="ontology-tab">
      <h2 className="m-0 mb-2 text-lg font-bold">
        온톨로지 <span className="text-muted-foreground" data-testid="ontology-version">버전 {ontology.version}</span>
      </h2>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        {userName(ontology.versionCreatedBy)} · {formatDateTime(ontology.versionCreatedAt)}
      </p>
      {isAdmin && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button type="button" data-testid="ontology-edit-yaml" onClick={() => open({ view: 'yaml' })}>
            YAML 로 편집
          </Button>
          <Button type="button" variant="outline" data-testid="ontology-history-open" onClick={() => open({ view: 'history' })}>
            버전 기록
          </Button>
          <Button asChild variant="outline">
            <a data-testid="ontology-export" href={ONTOLOGY_EXPORT_URL} download>
              YAML 내려받기
            </a>
          </Button>
          {draft && <span className="text-xs text-muted-foreground">편집 중인 초안이 있습니다</span>}
        </div>
      )}
      {message && (
        <Alert role="status" className="mb-3" data-testid="ontology-message" data-kind="success">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {query.view === 'yaml' && (
        <OntologyYamlEditor
          draft={draft}
          onDraftChange={onDraftChange}
          reloadOntology={reloadOntology}
          onSaved={(s) => void saved(s)}
          onClose={() => navigate(TAB_PATHS.ontology)}
        />
      )}
      {query.view === 'history' && (
        <OntologyHistory
          version={query.version}
          onOpenVersion={(version) => open({ view: 'history', version })}
          reloadOntology={reloadOntology}
          onSaved={(s) => void saved(s)}
        />
      )}
      {!query.view && <OntologyView />}
    </div>
  )
}
