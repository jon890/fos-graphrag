import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CurrentUser, OntologyPreview } from '../../api/types'
import { testOntology, withApp } from '../testSupport'
import { toDefinition } from '../../lib/ontologyDraft'
import { OntologyFormEditor } from './OntologyFormEditor'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'
import { OntologyTab } from './OntologyTab'

const admin: CurrentUser = { id: 'u0', email: 'admin@example.com', displayName: '관리자', role: 'ADMIN' }
const viewer: CurrentUser = { id: 'u9', email: 'v@example.com', displayName: '열람자', role: 'VIEWER' }

const renderTab = (user: CurrentUser) =>
  renderToStaticMarkup(withApp(<OntologyTab draft={null} onDraftChange={() => {}} reloadOntology={async () => {}} />, testOntology, user, '/ontology'))

function preview(overrides: Partial<OntologyPreview>): OntologyPreview {
  return {
    valid: true,
    errors: [],
    added: ['nodeTypes.Fund'],
    removed: [],
    changed: [],
    impacts: [],
    codeOwnedIgnored: [],
    yaml: 'nodeTypes: {}',
    definition: null,
    ...overrides,
  }
}

const renderPanel = (p: OntologyPreview) =>
  renderToStaticMarkup(<OntologyPreviewPanel preview={p} onSave={async () => Promise.reject(new Error('unused'))} onSaved={() => {}} onRestart={() => {}} />)

describe('온톨로지 탭의 편집 단추', () => {
  it('관리자에게는 편집, 버전 기록, 내려받기가 있고 버전 번호를 보인다', () => {
    const html = renderTab(admin)
    expect(html).toContain('data-testid="ontology-edit-form"')
    expect(html).toContain('data-testid="ontology-edit-yaml"')
    expect(html).toContain('data-testid="ontology-history-open"')
    expect(html).toMatch(/<a[^>]*data-testid="ontology-export"[^>]*href="\/api\/ontology\/export"/)
    expect(html).toContain('버전 1')
  })

  it('열람자에게는 편집 단추가 없다', () => {
    const html = renderTab(viewer)
    expect(html).not.toContain('ontology-edit-form')
    expect(html).not.toContain('ontology-edit-yaml')
    expect(html).not.toContain('ontology-history-open')
    expect(html).not.toContain('ontology-export')
    expect(html).toContain('data-testid="ontology-node-type"')
  })
})

describe('OntologyPreviewPanel', () => {
  it('영향이 있으면 확인란이 나오고 확인 전에는 저장을 누를 수 없다', () => {
    const html = renderPanel(preview({ impacts: [{ path: 'nodeTypes.Person', kind: 'REMOVED_NODE_TYPE', count: 2 }] }))
    expect(html).toContain('data-testid="ontology-save-confirm"')
    expect(html).toContain('이 타입의 노드 2개가 정의 없이 남습니다')
    expect(html).toMatch(/<button[^>]*data-testid="ontology-save"[^>]*disabled/)
  })

  it('영향이 없으면 확인란 없이 저장을 누를 수 있다', () => {
    const html = renderPanel(preview({}))
    expect(html).not.toContain('ontology-save-confirm')
    expect(html).not.toMatch(/<button[^>]*data-testid="ontology-save"[^>]*disabled/)
    expect(html).toContain('nodeTypes.Fund')
  })

  it('틀린 YAML 은 오류 목록만 보이고 저장 단추가 없다', () => {
    const html = renderPanel(preview({ valid: false, errors: ['nodeTypes.Fund: labelProperty 가 없습니다'], added: [] }))
    expect(html).toContain('data-testid="ontology-preview-error"')
    expect(html).toContain('labelProperty')
    expect(html).not.toContain('data-testid="ontology-save"')
  })

  it('바뀐 점이 없으면 안내만 보이고 저장 단추가 없다', () => {
    const html = renderPanel(preview({ added: [] }))
    expect(html).toContain('data-testid="ontology-diff-empty"')
    expect(html).not.toContain('data-testid="ontology-save"')
  })
})

describe('OntologyFormEditor', () => {
  const html = renderToStaticMarkup(
    withApp(
      <OntologyFormEditor
        draft={{ baseVersion: 1, source: 'form', yaml: null, definition: toDefinition(testOntology), removed: [], dirty: false }}
        onDraftChange={() => {}}
        reloadOntology={async () => {}}
        onSaved={() => {}}
        onClose={() => {}}
        onOpenYaml={() => {}}
      />,
      testOntology,
      admin,
      '/ontology?view=form',
    ),
  )

  it('Claim 을 뺀 노드 타입 카드를 그린다', () => {
    expect(html).toContain('data-testid="ontology-form"')
    expect(html).toContain('data-type="Company"')
    expect(html).not.toContain('data-type="Claim"')
  })

  it('코드가 읽는 속성은 빼기 단추가 꺼져 있다', () => {
    const row = /<div[^>]*data-testid="ontology-form-prop"[^>]*data-prop="url"[\s\S]*?<\/div><div class="mt-2/.exec(html)?.[0] ?? ''
    expect(row).toMatch(/<button[^>]*data-testid="ontology-form-remove"[^>]*disabled/)
  })
})
