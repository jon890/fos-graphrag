package dev.fos.graphrag.agentlab.planning;

import org.bsc.langgraph4j.action.NodeAction;

import java.util.List;
import java.util.Map;

public class NormalizeRequestNode implements NodeAction<PlanningState> {

    @Override
    public Map<String, Object> apply(PlanningState state) throws Exception {
        final String request = state.getRequest();
        final String normalized = request.trim();
        if (normalized.isEmpty()) {
            return Map.of(PlanningState.REQUEST, "",
                          PlanningState.FINDINGS, List.of("요구사항이 비어 있습니다."));
        }

        return Map.of(PlanningState.REQUEST, normalized);
    }
}
