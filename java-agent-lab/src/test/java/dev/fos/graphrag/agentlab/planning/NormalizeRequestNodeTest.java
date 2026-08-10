package dev.fos.graphrag.agentlab.planning;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class NormalizeRequestNodeTest {

    private final NormalizeRequestNode node = new NormalizeRequestNode();

    @Test
    @DisplayName("요구사항의 앞뒤 공백을 제거한 부분 업데이트를 반환한다")
    void trimsRequest() throws Exception {
        var state = new PlanningState(Map.of(
            PlanningState.REQUEST,
            "  로그인 기능을 추가한다  "));

        var update = node.apply(state);

        assertThat(update).containsOnly(
            Map.entry(PlanningState.REQUEST, "로그인 기능을 추가한다"));
        assertThat(state.getRequest()).isEqualTo("  로그인 기능을 추가한다  ");
    }

    @Test
    @DisplayName("빈 요구사항이면 정규화된 값과 발견 사항을 함께 반환한다")
    void recordsFindingWhenRequestIsBlank() throws Exception {
        var state = new PlanningState(Map.of(
            PlanningState.REQUEST,
            "   "));

        var update = node.apply(state);

        assertThat(update.get(PlanningState.REQUEST)).isEqualTo("");
        assertThat(update.get(PlanningState.FINDINGS))
            .isEqualTo(List.of("요구사항이 비어 있습니다."));
    }
}
