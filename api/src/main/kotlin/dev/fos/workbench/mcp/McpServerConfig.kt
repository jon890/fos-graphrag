package dev.fos.workbench.mcp

import dev.fos.workbench.agent.BearerTokenFilter
import io.modelcontextprotocol.common.McpTransportContext
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper
import io.modelcontextprotocol.server.McpServer
import io.modelcontextprotocol.server.McpStatelessSyncServer
import io.modelcontextprotocol.server.transport.HttpServletStatelessServerTransport
import io.modelcontextprotocol.spec.McpSchema
import org.springframework.boot.web.servlet.ServletRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import tools.jackson.databind.json.JsonMapper

/**
 * MCP Java SDK 의 세션 없는 servlet 전송을 `/mcp` 에 건다(docs/adr/015-remote-mcp-oauth.md). Spring AI 의 MCP starter 는 쓰지 않는다.
 * 전송은 `POST` 만 받고 `GET`, `DELETE` 는 servlet 이 `405` 로 답한다. 인증과 요청 한도는 앞의 `mcpFilterChain` 이 한다.
 */
@Configuration
class McpServerConfig {

    /** 인증 필터가 요청 속성에 둔 주체를 도구 처리기가 읽을 전송 컨텍스트로 옮긴다 */
    @Bean
    fun mcpTransport(mapper: JsonMapper): HttpServletStatelessServerTransport =
        HttpServletStatelessServerTransport.builder()
            .jsonMapper(JacksonMcpJsonMapper(mapper))
            .messageEndpoint(ENDPOINT)
            .contextExtractor { request ->
                val principal = request.getAttribute(BearerTokenFilter.PRINCIPAL_ATTRIBUTE)
                if (principal == null) McpTransportContext.EMPTY else McpTransportContext.create(mapOf(McpTools.PRINCIPAL to principal))
            }
            .build()

    /** 입력 검사는 서비스가 한다. SDK 의 스키마 검사를 켜면 오류가 계약의 `{code, message, details}` 모양이 아니게 된다 */
    @Bean(destroyMethod = "close")
    fun mcpServer(transport: HttpServletStatelessServerTransport, mapper: JsonMapper, tools: McpTools): McpStatelessSyncServer =
        McpServer.sync(transport)
            .jsonMapper(JacksonMcpJsonMapper(mapper))
            .serverInfo(McpSchema.Implementation(NAME, TITLE, VERSION))
            .validateToolInputs(false)
            .tools(tools.specifications())
            .build()

    @Bean
    fun mcpServlet(transport: HttpServletStatelessServerTransport): ServletRegistrationBean<HttpServletStatelessServerTransport> =
        ServletRegistrationBean(transport, ENDPOINT).apply { setName("mcp") }

    companion object {
        const val ENDPOINT = "/mcp"
        const val NAME = "valuation-ontology"
        const val TITLE = "가치투자 온톨로지"

        /** 클라이언트에 알리는 서버 버전. 도구의 이름이나 입력을 바꾸면 올린다 */
        const val VERSION = "1.0.0"
    }
}
