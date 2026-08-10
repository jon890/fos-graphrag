package dev.fos.graphrag.agentlab.planning;

import org.bsc.langgraph4j.state.AgentState;
import org.bsc.langgraph4j.state.Channel;
import org.bsc.langgraph4j.state.Channels;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PlanningState extends AgentState {

    public static final String REQUEST = "request";
    public static final String FINDINGS = "findings";
    public static final Map<String, Channel<?>> SCHEMA = Map.of(
        REQUEST, Channels.base(() -> ""),
        FINDINGS, Channels.appender(ArrayList::new));


    public PlanningState(Map<String, Object> initData) {
        super(initData);
    }


    public String getRequest() {
        return this.<String>value(REQUEST).orElse("");
    }


    public List<String> getFindings() {
        return this.<List<String>>value(FINDINGS).orElseGet(List::of);
    }
}
