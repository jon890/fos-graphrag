package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.config.WorkbenchProperties
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 에이전트 API. 조회만 있고 연동 토큰으로만 부른다(docs/api-contract.md 「에이전트 API(`/api/v1`)」) */
@RestController
@RequestMapping("/api/v1")
class AgentV1Controller(private val mapper: V1Mapper, private val properties: WorkbenchProperties) {

    /** 토큰을 넣은 뒤 연결이 되는지 확인할 때 부른다 */
    @GetMapping("/me")
    fun me(@AuthenticationPrincipal principal: AgentPrincipal): V1Me = V1Me(
        user = V1MeUser(principal.userId, principal.displayName, principal.role.name),
        token = V1MeToken(principal.tokenId, principal.tokenName, principal.last4),
        rateLimitPerMinute = properties.agent.rateLimitPerMinute,
    )

    @GetMapping("/ontology")
    fun ontology(): V1Ontology = mapper.ontology()
}
