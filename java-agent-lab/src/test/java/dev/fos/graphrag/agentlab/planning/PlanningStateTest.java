package dev.fos.graphrag.agentlab.planning;

import org.bsc.langgraph4j.state.AgentState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PlanningStateTest {

    @Test
    @DisplayName("상태 키가 없으면 안전한 기본값을 읽는다")
    void readsSafeDefaults() {
        var state = new PlanningState(Map.of());

        assertThat(state.getRequest()).isEmpty();
        assertThat(state.getFindings()).isEmpty();
    }

    @Test
    @DisplayName("request 채널은 기존 값을 새 값으로 교체한다")
    void replacesRequest() {
        var current = Map.<String, Object>of(PlanningState.REQUEST, "기존 요구사항");

        var updated = AgentState.updateState(
            current,
            Map.of(PlanningState.REQUEST, "새 요구사항"),
            PlanningState.SCHEMA);

        assertThat(updated.get(PlanningState.REQUEST)).isEqualTo("새 요구사항");
    }

    @Test
    @DisplayName("findings 채널은 기존 목록에 중복 없이 결과를 누적한다")
    void appendsFindingsWithoutDuplicates() {
        var current = new HashMap<String, Object>();
        current.put(
            PlanningState.FINDINGS,
            new ArrayList<>(List.of("요구사항이 모호함")));

        var updated = AgentState.updateState(
            current,
            Map.of(
                PlanningState.FINDINGS,
                List.of("테스트 조건이 없음", "요구사항이 모호함")),
            PlanningState.SCHEMA);

        assertThat(updated.get(PlanningState.FINDINGS))
            .isEqualTo(List.of("요구사항이 모호함", "테스트 조건이 없음"));
    }
}
