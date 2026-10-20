import { useApp, useLabels } from '../context'
import { withEulReul } from '../lib/labels'

/**
 * 아직 항목을 고르지 않은 그래프 화면에 보이는 첫 안내. 앱이 무엇인지 한 줄로 알리고 시작 순서를 보여 준다.
 * 소개 문장은 기업과 종목에만 묶이지 않게 쓴다. 단계 이름만 온톨로지 표시 이름을 따른다.
 */
export function WelcomeGuide() {
  const { canEdit } = useApp()
  const labels = useLabels()
  return (
    <div className="welcome" data-testid="welcome-guide">
      <h2>투자 지식을 근거와 함께 쌓는 곳</h2>
      <p>항목을 만들고 서로 이어, 투자에 관한 지식을 한곳에 정리합니다. 모든 주장에는 근거 문서가 붙습니다.</p>
      {canEdit && (
        <ol>
          <li>
            <strong>{labels.type('Company')} 추가</strong>
            <span className="muted small"> 왼쪽 아래 「무엇을 만들까요?」 에서 고릅니다.</span>
          </li>
          <li>
            <strong>{labels.type('Document')} 등록</strong>
            <span className="muted small"> 같은 곳에서 뉴스나 공시의 제목과 주소를 적습니다.</span>
          </li>
          <li>
            <strong>{labels.type('Claim')} 추가</strong>
            <span className="muted small">
              {' '}
              {withEulReul(labels.type('Company'))} 열고 맨 아래 「주장 추가」 에서 근거 문서를 붙입니다.
            </span>
          </li>
        </ol>
      )}
      <p className="muted small">이미 등록한 항목은 왼쪽에서 검색해 고르면 주변 그래프가 나옵니다.</p>
    </div>
  )
}
