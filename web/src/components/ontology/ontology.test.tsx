import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CurrentUser, OntologyPreview } from '../../api/types'
import { testOntology, withApp } from '../testSupport'
import { OntologyPreviewPanel } from './OntologyPreviewPanel'
import { OntologyTab } from './OntologyTab'
import { OntologyYamlEditor } from './OntologyYamlEditor'

const admin: CurrentUser = { id: 'u0', email: 'admin@example.com', displayName: '관리자', role: 'ADMIN', guideDoneAt: null }
const viewer: CurrentUser = { id: 'u9', email: 'v@example.com', displayName: '열람자', role: 'VIEWER', guideDoneAt: null }

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
  it('관리자에게는 YAML 편집, 버전 기록, 내려받기가 있고 버전 번호를 보인다', () => {
    const html = renderTab(admin)
    expect(html).not.toContain('ontology-edit-form')
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

  it('지금 버전 보기의 관계 표에 문장 틀 열이 있고 틀이 없으면 - 를 보인다', () => {
    const html = renderTab(viewer)
    const table = /<table[^>]*data-testid="ontology-relationships"[\s\S]*?<\/table>/.exec(html)?.[0] ?? ''
    expect(table).toContain('<th')
    expect(table).toMatch(/<th[^>]*>문장 틀<\/th>/)
    expect(table).toMatch(/<td[^>]*>ISSUES<\/td><td[^>]*>Company → Security<\/td><td[^>]*>-<\/td>/)

    const withSentence = {
      ...testOntology,
      relationshipTypes: { ISSUES: { ...testOntology.relationshipTypes.ISSUES, sentence: '{from}이(가) {to}을(를) 발행한다' } },
    }
    const sentenceHtml = renderToStaticMarkup(
      withApp(<OntologyTab draft={null} onDraftChange={() => {}} reloadOntology={async () => {}} />, withSentence, viewer, '/ontology'),
    )
    expect(sentenceHtml).toContain('{from}이(가) {to}을(를) 발행한다')
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
  it('줄 번호가 든 오류는 줄 이동 단추로 그린다', () => {
    const html = renderToStaticMarkup(
      <OntologyPreviewPanel
        preview={preview({ valid: false, errors: ['nodeTypes.Fund 가 틀렸습니다 (줄 7)'], added: [] })}
        onSave={async () => Promise.reject(new Error('unused'))}
        onSaved={() => {}}
        onRestart={() => {}}
        onGoToLine={() => {}}
      />,
    )
    expect(html).toMatch(/<button[^>]*data-testid="ontology-preview-error-line"[^>]*data-line="7"[^>]*>\(줄 7\)<\/button>/)
  })

  it('이동 방법을 받지 못하면 줄 번호는 글자로 남는다', () => {
    const html = renderPanel(preview({ valid: false, errors: ['틀렸습니다 (줄 7)'], added: [] }))
    expect(html).not.toContain('ontology-preview-error-line')
    expect(html).toContain('(줄 7)')
  })
})

describe('OntologyYamlEditor', () => {
  const html = renderToStaticMarkup(
    withApp(
      <OntologyYamlEditor
        draft={{ baseVersion: 1, yaml: 'nodeTypes: {}\nrelationshipTypes: {}', dirty: true }}
        onDraftChange={() => {}}
        reloadOntology={async () => {}}
        onSaved={() => {}}
        onClose={() => {}}
        onOpenHistory={() => {}}
      />,
      testOntology,
      admin,
      '/ontology?view=yaml',
    ),
  )
  const toolbar = /data-testid="ontology-yaml-toolbar"[\s\S]*?(?=data-testid="ontology-yaml-gutter")/.exec(html)?.[0] ?? ''

  it('툴바에 확인, 버리기, 버전 기록, 내려받기, 초안 상태가 있다', () => {
    for (const id of ['ontology-preview', 'ontology-draft-discard', 'ontology-toolbar-history', 'ontology-toolbar-export', 'ontology-draft-status']) {
      expect(toolbar, id).toContain(`data-testid="${id}"`)
    }
    expect(toolbar).toMatch(/data-testid="ontology-draft-status"[^>]*data-dirty="true"[^>]*>버전 1 에서 시작 · 고침/)
  })

  it('줄 번호 칸과 줄을 접지 않는 입력칸이 있고 폼 단추는 없다', () => {
    expect(html).toContain('data-testid="ontology-yaml-gutter"')
    expect(html).toMatch(/<textarea[^>]*wrap="off"[^>]*data-testid="ontology-yaml-input"/)
    expect(html).not.toContain('ontology-yaml-to-form')
  })
})
