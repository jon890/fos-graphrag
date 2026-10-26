package dev.fos.workbench.mcp

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.agent.v1.AgentQueryService
import dev.fos.workbench.agent.v1.SecurityLookupService
import dev.fos.workbench.agent.v1.V1Inputs
import dev.fos.workbench.agent.v1.V1Mapper
import dev.fos.workbench.agent.v1.V1MeUser
import dev.fos.workbench.agent.v1.V1ProposalResult
import dev.fos.workbench.agent.v1.V1Results
import dev.fos.workbench.agent.v1.V1TradeResult
import dev.fos.workbench.config.RateLimiter
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.proposal.ProposalKind
import dev.fos.workbench.proposal.ProposalService
import dev.fos.workbench.trade.TradeService
import dev.fos.workbench.web.ApiException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.ValidationFailedException
import io.modelcontextprotocol.server.McpStatelessServerFeatures.SyncToolSpecification
import io.modelcontextprotocol.spec.McpSchema.CallToolResult
import io.modelcontextprotocol.spec.McpSchema.Tool
import io.modelcontextprotocol.spec.McpSchema.ToolAnnotations
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal

/**
 * `/mcp` 의 도구(docs/api-contract.md 「원격 MCP(`/mcp`)」 의 「도구」). 도구 이름과 칸 이름은 Hermes 커넥터와 같다.
 * 처리기는 `/api/v1` 의 컨트롤러가 부르는 서비스와 입력 검사를 그대로 부른다. 입력 스키마는 칸의 타입과 필수 여부만 알리고 값은 서비스가 검사한다.
 * 처리기는 요청 스레드 밖에서 돌 수 있어 인증한 주체를 전송 컨텍스트의 [PRINCIPAL] 에서 꺼낸다.
 */
@Component
class McpTools(
    private val v1: V1Mapper,
    private val queries: AgentQueryService,
    private val lookups: SecurityLookupService,
    private val trades: TradeService,
    private val proposals: ProposalService,
    private val properties: WorkbenchProperties,
    @Qualifier("agentWriteRateLimiter") private val writeLimiter: RateLimiter,
    private val errors: McpToolErrors,
    private val mapper: JsonMapper,
) {

    fun specifications(): List<SyncToolSpecification> = listOf(
        tool(
            "get_connection", "연결 확인하기",
            "워크벤치에 누구로, 어떤 권한으로 연결됐는지 확인합니다. 대화를 시작할 때나 기록이 거절됐을 때 부릅니다. " +
                "connection.scope 가 READ(조회만)면 체결 기록과 제안 올리기를 할 수 없으니 부르지 말고, 「조회와 기록」 으로 다시 연결해야 한다고 알려 줍니다. 입력은 없습니다.",
            schema(),
        ) { principal, _ -> connection(principal) },
        tool(
            "get_ontology", "온톨로지 요약 보기",
            "워크벤치에 어떤 종류의 항목(기업, 종목, 산업, 투자 결정, 밸류에이션, 근거 문서 등)과 관계가 있고, 항목마다 어떤 속성이 있는지 읽습니다. " +
                "항목을 찾을 때 넣을 종류 이름이나 제안에 쓸 속성 키를 모를 때 먼저 부릅니다. 대화마다 한 번이면 충분합니다. 입력은 없습니다.",
            schema(),
        ) { _, _ -> v1.ontology() },
        tool(
            "get_ontology_yaml", "온톨로지 정의 받기",
            "온톨로지 정의 전체를 YAML 로 받습니다. 항목 종류, 속성, 관계 종류 같은 정의를 바꾸려 할 때만 부릅니다. " +
                "결과의 version 을 propose_ontology_change 의 baseVersion 에 넣습니다. 키의 뜻은 get_ontology 의 설명을 봅니다. 입력은 없습니다.",
            schema(),
        ) { _, _ -> queries.ontologyYaml() },
        tool(
            "search_nodes", "항목 찾기",
            "이름이나 종목 코드로 워크벤치의 기업, 산업, 투자 결정, 근거 문서 같은 항목을 찾습니다. " +
                "사용자가 이름을 말하면 이것으로 id 를 얻은 뒤 get_node 로 자세히 읽습니다. 결과에는 속성이 없습니다. " +
                "보유 종목의 투자 근거는 lookup_security 가 더 맞습니다.",
            schema(
                "q" to string("찾을 이름이나 종목 코드. 100자까지이고 대소문자를 가리지 않는 부분 일치입니다"),
                "types" to strings("좁힐 종류 이름(예: Company, Decision, Valuation). get_ontology 의 nodeTypes 의 key 입니다"),
                "page" to integer(PAGE),
                "size" to integer(SIZE),
            ),
        ) { _, args -> queries.search(args.string("q"), args.strings("types"), args.int("page"), args.int("size")) },
        tool(
            "get_node", "항목 자세히 보기",
            "항목 하나의 속성, 이어진 관계, 주장, 근거 문서, 개념을 읽습니다. 「이 기업은 어떤 곳이야?」, 「이 결정은 무슨 내용이야?」 처럼 한 항목을 설명할 때 씁니다. " +
                "주장은 reviewStatus 가 REVIEWED 인 것을 근거로 앞에 두고, DRAFT 는 아직 검토 전이라고 밝힙니다. 이름이 Truncated 로 끝나는 칸이 참이면 일부만 읽은 것입니다.",
            schema("id" to string(ID), required = listOf("id")),
        ) { _, args -> queries.detail(args.required("id")) },
        tool(
            "trace_node", "근거 따라가기",
            "투자 결정이나 밸류에이션에서 시작해 병목, 산업, 세상의 변화까지 근거를 거슬러 올라가고, 이 항목에 기대는 항목도 함께 읽습니다. " +
                "「왜 샀지?」, 「근거가 충분해?」 를 물을 때 씁니다. 단계마다 status 가 SUPPORTED(근거 문서나 검토한 주장이 있음), " +
                "PARTIAL(검토 전 주장만 있음), MISSING(근거 없음)이고 missing 에 아직 잇지 않은 관계가 있습니다. myKnowledge 는 사용자의 이해 표시입니다.",
            schema("id" to string(ID), required = listOf("id")),
        ) { principal, args -> queries.trace(args.required("id"), principal.userId) },
        tool(
            "get_neighborhood", "주변 그래프 보기",
            "한 항목에서 한두 단계 안에 이어진 항목과 관계를 읽습니다. 같은 산업의 다른 기업이나 한 병목에 걸린 기업처럼 옆으로 넓혀 볼 때 씁니다. " +
                "근거의 위아래 사슬은 trace_node 가 맞습니다. truncated 가 참이면 일부만 읽은 것입니다.",
            schema("id" to string(ID), "hops" to integer("몇 단계까지 볼지. 1이나 2이고 기본 1입니다"), required = listOf("id")),
        ) { _, args -> queries.neighborhood(args.required("id"), args.int("hops") ?: 1) },
        tool(
            "lookup_security", "종목의 투자 근거 찾기",
            "종목 코드로 워크벤치의 종목을 찾고, 그 종목에 대한 사용자의 투자 결정과 발행 기업의 밸류에이션 시나리오(약세, 기본, 강세의 주당 가치)를 함께 읽습니다. " +
                "「내가 가진 이 종목 왜 샀더라?」, 「적정 가치가 얼마였지?」 를 물을 때 씁니다. 맞는 종목이 없으면 matches 가 비어 있습니다.",
            schema(
                "ticker" to string("국내 6자리 코드나 미국 티커. 32자까지이고 증권사 도구가 준 값을 바꾸지 않고 넣습니다"),
                "market" to string("시장 코드(KR, US, KOSPI, KOSDAQ, NASDAQ, NYSE, AMEX 등). 모르면 비웁니다"),
                required = listOf("ticker"),
            ),
        ) { _, args -> lookups.lookup(args.string("market"), args.string("ticker")) },
        tool(
            "list_my_knowledge", "내 공부 목록 보기",
            "사용자가 안다(KNOWN), 헷갈린다(UNSURE), 공부 중(LEARNING)이라고 표시한 항목과 메모를 읽습니다. 「뭘 더 공부해야 해?」 를 물을 때 씁니다. " +
                "항목마다 그 항목이 걸린 투자 결정과 근거 문서, 개념이 함께 옵니다.",
            schema("level" to strings("좁힐 표시(KNOWN, UNSURE, LEARNING). 비우면 전체입니다"), "page" to integer(PAGE), "size" to integer(SIZE)),
        ) { principal, args -> queries.knowledge(principal.userId, args.strings("level"), args.int("page"), args.int("size")) },
        tool(
            "record_trades", "체결 기록하기",
            "증권사에서 읽은 체결을 워크벤치의 내 체결 기록에 남깁니다. 체결 기록은 사용자 본인만 봅니다. " +
                "체결이 끝난 주문만 넣습니다. 이미 있는 체결은 고쳐지지 않기 때문입니다. 계좌 번호 같은 계좌 정보는 넣지 않습니다. 넣으면 거절됩니다. " +
                "같은 체결을 다시 보내도 새로 생기지 않으니 다시 보내도 됩니다. 결과의 status 는 created(새로 저장)나 existing(이미 있음)입니다. " +
                "한 건이라도 틀리면 아무것도 저장되지 않습니다.",
            schema("trades" to array("기록할 체결. 1~50건입니다", TRADE), required = listOf("trades")),
            write = true,
        ) { principal, args ->
            val saved = trades.save(principal.userId, V1Inputs.items(args.raw, "trades"), principal.tokenId)
            V1Results(saved.map { V1TradeResult(it.index, it.status, v1.trade(it.trade)) })
        },
        tool(
            "list_my_trades", "내 체결 보기",
            "워크벤치에 기록한 사용자의 체결과 이어진 투자 결정을 체결 시각이 늦은 순서로 읽습니다. " +
                "어떤 체결을 이미 기록했는지, 어느 체결이 아직 투자 결정과 이어지지 않았는지 볼 때 씁니다. decisions 가 비어 있으면 아직 결정과 잇지 않은 체결입니다.",
            schema(
                "ticker" to string("좁힐 종목 코드. 32자까지입니다"),
                "from" to string("이 시각 이후의 체결. 오프셋이 붙은 시각(예: 2026-10-01T00:00:00+09:00)입니다"),
                "to" to string("이 시각 전의 체결. 오프셋이 붙은 시각입니다"),
                "page" to integer(PAGE),
                "size" to integer(SIZE),
            ),
        ) { principal, args ->
            // 쪽 크기 오류가 조건 오류보다 먼저다. `/api/v1/trades` 와 같다
            val query = v1.page(args.int("page"), args.int("size"))
            val filter = V1Inputs.tradeFilter(args.string("ticker"), args.string("from"), args.string("to"))
            val result = trades.list(principal.userId, filter, query)
            Page(result.items.map(v1::trade), result.page, result.size, result.totalItems, result.totalPages)
        },
        tool(
            "submit_proposals", "제안 올리기",
            "대화에서 해석한 내용을 워크벤치에 제안으로 올립니다. 올리기만 하고 바로 바뀌지 않습니다. 사용자가 워크벤치의 「제안」 에서 승인해야 반영됩니다. " +
                "체결을 투자 결정과 잇거나, 새 투자 결정을 만들거나, 근거를 잇거나, 공부 메모를 남기거나, 항목을 고치거나 보관하거나, 주장을 만들 때 씁니다. " +
                "kind 별 payload: LINK_TRADE_DECISION 은 {tradeIds, decisionId}, CREATE_NODE 는 {type, properties, links, tradeIds}, " +
                "CREATE_RELATIONSHIP 은 {type, fromId, toId}, STUDY_NOTE 는 {nodeId, level(KNOWN, UNSURE, LEARNING), note(1000자까지)}, " +
                "UPDATE_NODE 는 {nodeId, expectedRevision, properties(바꿀 속성만. null 은 지움)}, ARCHIVE_NODE 는 {nodeId, expectedRevision, reason(1000자까지)}, " +
                "ARCHIVE_RELATIONSHIP 은 {relationshipId, reason(1000자까지)}, " +
                "CREATE_CLAIM 은 {predicate, subjectId, objectId, documentIds, description, evidenceText, validFrom, validTo}, " +
                "ONTOLOGY_CHANGE 는 {baseVersion, yaml, note} 입니다. " +
                "UPDATE_NODE, ARCHIVE_NODE 의 expectedRevision 에는 get_node 가 준 node.revision 을 넣습니다. 그 사이 항목이 바뀌면 승인이 실패하니 다시 읽고 올립니다. " +
                "ARCHIVE_RELATIONSHIP 의 relationshipId 는 get_node 의 relations[].relationshipId 입니다. 주장에 딸린 관계는 보관할 수 없습니다. " +
                "CREATE_CLAIM 의 documentIds 에는 근거 문서(Document) id 가 하나 이상(20개까지) 있어야 합니다. Claim 은 UPDATE_NODE 로 고치지 않습니다. " +
                "온톨로지 정의 전체를 보내는 ONTOLOGY_CHANGE 는 propose_ontology_change 가 더 맞습니다. " +
                "종류와 속성 키는 get_ontology 로 확인합니다. 같은 dedupeKey 로 다시 올리면 새로 생기지 않고 있던 제안을 돌려줍니다. " +
                "한 건이라도 틀리면 아무것도 올라가지 않습니다.",
            schema("proposals" to array("올릴 제안. 1~20건입니다", PROPOSAL), required = listOf("proposals")),
            write = true,
        ) { principal, args ->
            val saved = proposals.submit(principal.userId, principal.tokenId, principal.tokenName, V1Inputs.items(args.raw, "proposals"))
            V1Results(saved.map { V1ProposalResult(it.index, it.status, v1.proposal(it.proposal)) })
        },
        tool(
            "propose_ontology_change", "온톨로지 변경 제안하기",
            "항목 종류, 속성, 관계 종류 같은 온톨로지 정의를 바꾸자고 제안합니다. 올리기만 하고 바로 바뀌지 않습니다. 관리자가 워크벤치의 「제안」 에서 승인해야 반영됩니다. " +
                "먼저 get_ontology_yaml 로 받은 YAML 을 고쳐 정의 전체를 보내고, 그때 받은 version 을 baseVersion 에 넣습니다. " +
                "정의가 틀리면 ONTOLOGY_INVALID 오류의 details.errors(줄 번호 포함)를 읽고 고쳐 다시 올립니다. " +
                "REVISION_CONFLICT 면 그 사이 정의가 바뀐 것이니 get_ontology_yaml 로 다시 받아 고칩니다. " +
                "같은 dedupeKey 로 다시 올리면 새로 생기지 않고 있던 제안을 돌려줍니다.",
            schema(
                "baseVersion" to integer("고친 YAML 을 받은 온톨로지 버전. get_ontology_yaml 의 version 입니다"),
                "yaml" to string("고친 온톨로지 정의 전체(YAML)입니다"),
                "rationale" to string("사람이 승인할지 판단할 까닭. 2000자까지입니다"),
                "note" to string("새 버전에 남길 메모. 1000자까지이고 선택입니다"),
                "dedupeKey" to string("같은 제안이면 늘 같은 값이 되는 키. 100자까지이고 선택입니다"),
                required = listOf("baseVersion", "yaml", "rationale"),
            ),
            write = true,
        ) { principal, args ->
            val item = buildMap {
                put("kind", ProposalKind.ONTOLOGY_CHANGE.name)
                put("payload", mapOf("baseVersion" to args.int("baseVersion"), "yaml" to args.string("yaml"), "note" to args.string("note")))
                put("rationale", args.string("rationale"))
                args.string("dedupeKey")?.let { put("dedupeKey", it) }
            }
            val saved = proposals.submit(principal.userId, principal.tokenId, principal.tokenName, listOf(item)).single()
            V1ProposalResult(saved.index, saved.status, v1.proposal(saved.proposal))
        },
        tool(
            "list_my_proposals", "내 제안 보기",
            "워크벤치에 올린 제안이 대기 중인지, 승인됐는지, 거절됐다면 왜인지 읽습니다. 같은 제안을 다시 올리기 전에 이미 처리됐는지 볼 때 씁니다. " +
                "거절된 제안은 같은 내용으로 다시 올리지 않습니다.",
            schema("status" to string("좁힐 상태(PENDING, ACCEPTED, REJECTED). 비우면 전체입니다"), "page" to integer(PAGE), "size" to integer(SIZE)),
        ) { principal, args ->
            val result = proposals.list(principal.userId, args.string("status"), v1.page(args.int("page"), args.int("size")))
            Page(result.items.map(v1::proposal), result.page, result.size, result.totalItems, result.totalPages)
        },
    )

    private fun connection(principal: AgentPrincipal) = McpConnection(
        user = V1MeUser(principal.userId, principal.displayName, principal.role.name),
        connection = McpConnectionInfo(principal.kind.name, principal.tokenId, principal.tokenName, principal.scope.name),
        rateLimitPerMinute = properties.agent.rateLimitPerMinute,
        writeRateLimitPerMinute = properties.agent.writeRateLimitPerMinute,
    )

    /**
     * 처리기를 감싼다. 쓰기 도구는 범위를 먼저 확인하고, 통과하면 연결마다의 쓰기 한도를 센다.
     * 실패는 JSON-RPC 오류가 아니라 `isError: true` 결과다.
     */
    private fun tool(
        name: String,
        title: String,
        description: String,
        inputSchema: Map<String, Any>,
        write: Boolean = false,
        call: (AgentPrincipal, Args) -> Any,
    ): SyncToolSpecification {
        val tool = Tool.builder().name(name).title(title).description(description).inputSchema(inputSchema)
            .annotations(if (write) WRITE_HINTS else READ_HINTS).build()
        return SyncToolSpecification(tool) { context, request ->
            try {
                val principal = context.get(PRINCIPAL) as? AgentPrincipal ?: throw IllegalStateException("전송 컨텍스트에 인증한 주체가 없다")
                if (write) {
                    V1Inputs.requireWrite(principal)
                    val decision = writeLimiter.tryAcquire(principal.tokenId)
                    if (!decision.allowed) throw rateLimited(decision.retryAfterSeconds)
                }
                val result = call(principal, Args(request.arguments().orEmpty()))
                CallToolResult.builder().addTextContent(mapper.writeValueAsString(result)).isError(false).build()
            } catch (e: Exception) {
                errors.result(e)
            }
        }
    }

    private fun rateLimited(seconds: Long) = ApiException(
        HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.", mapOf("retryAfterSeconds" to seconds),
    )

    /** 도구 인자. 타입이 틀린 칸은 그 칸 하나로 `VALIDATION_FAILED` 다. 같은 경로의 쿼리 값이 틀렸을 때와 같은 문장이다 */
    class Args(val raw: Map<String, Any?>) {

        fun string(key: String): String? = when (val value = raw[key]) {
            null -> null
            is String -> value
            else -> throw invalid(key)
        }

        fun required(key: String): String = string(key)?.takeIf { it.isNotBlank() }
            ?: throw ValidationFailedException(mapOf(key to "필수 값입니다."))

        fun strings(key: String): List<String>? = when (val value = raw[key]) {
            null -> null
            is List<*> -> value.map { it as? String ?: throw invalid(key) }
            else -> throw invalid(key)
        }

        /** 정수만 받는다. `2.0` 처럼 소수점 아래가 없는 수와 숫자만 쓴 문자열은 정수로 읽는다 */
        fun int(key: String): Int? = when (val value = raw[key]) {
            null -> null
            is Int -> value
            is Number -> runCatching { BigDecimal(value.toString()).intValueExact() }.getOrElse { throw invalid(key) }
            is String -> value.trim().toIntOrNull() ?: throw invalid(key)
            else -> throw invalid(key)
        }

        private fun invalid(key: String) = ValidationFailedException(mapOf(key to "형식이 올바르지 않습니다."))
    }

    companion object {
        /** 전송 컨텍스트에서 인증한 [AgentPrincipal] 을 담는 키 */
        const val PRINCIPAL = "agentPrincipal"

        private const val ID = "항목 id(UUID). search_nodes 나 다른 도구의 결과에 있습니다"
        private const val PAGE = "쪽 번호. 0부터이고 기본 0입니다"
        private const val SIZE = "한 쪽의 항목 수. 1~50이고 기본 20입니다"

        private val READ_HINTS = ToolAnnotations(null, true, false, null, false, null)

        /** 같은 입력을 다시 보내도 새로 생기지 않고, 있는 것을 고치거나 지우지 않는다 */
        private val WRITE_HINTS = ToolAnnotations(null, false, false, true, false, null)

        private fun schema(vararg fields: Pair<String, Map<String, Any>>, required: List<String> = emptyList()): Map<String, Any> = buildMap {
            put("type", "object")
            put("properties", mapOf(*fields))
            if (required.isNotEmpty()) put("required", required)
        }

        private fun string(description: String): Map<String, Any> = mapOf("type" to "string", "description" to description)

        private fun integer(description: String): Map<String, Any> = mapOf("type" to "integer", "description" to description)

        private fun number(description: String): Map<String, Any> = mapOf("type" to "number", "description" to description)

        private fun strings(description: String): Map<String, Any> =
            mapOf("type" to "array", "items" to mapOf("type" to "string"), "description" to description)

        private fun array(description: String, item: Map<String, Any>): Map<String, Any> =
            mapOf("type" to "array", "items" to item, "description" to description)

        /** `V1TradeInput`(docs/api-contract.md 「`POST /api/v1/trades`」) */
        private val TRADE = schema(
            "broker" to string("증권사. TOSS 나 OTHER 입니다"),
            "externalId" to string("증권사의 체결 번호. 없으면 주문 번호입니다. 같은 체결이면 늘 같은 값이어야 합니다"),
            "side" to string("BUY(매수)나 SELL(매도)입니다"),
            "market" to string("시장 코드(KR, US, KOSPI, KOSDAQ, NASDAQ, NYSE, AMEX 등)입니다"),
            "ticker" to string("종목 코드입니다"),
            "name" to string("종목 이름. 선택입니다"),
            "quantity" to number("체결 수량. 0 보다 큽니다"),
            "price" to number("평균 체결 가격입니다"),
            "amount" to number("체결 금액입니다"),
            "fee" to number("수수료와 세금을 더한 값. 선택입니다"),
            "currency" to string("통화. 영문 세 자리(예: KRW, USD)입니다"),
            "executedAt" to string("체결 시각. 오프셋이 붙은 시각(예: 2026-10-24T10:00:00+09:00)입니다"),
            required = listOf("broker", "externalId", "side", "market", "ticker", "quantity", "price", "amount", "currency", "executedAt"),
        )

        /** `V1ProposalInput`(docs/api-contract.md 「`POST /api/v1/proposals`」) */
        private val PROPOSAL = schema(
            "kind" to string(
                "LINK_TRADE_DECISION, CREATE_NODE, CREATE_RELATIONSHIP, STUDY_NOTE, UPDATE_NODE, ARCHIVE_NODE, ARCHIVE_RELATIONSHIP, " +
                    "CREATE_CLAIM, ONTOLOGY_CHANGE 가운데 하나입니다. payload 모양은 submit_proposals 의 설명에 있습니다. " +
                    "ONTOLOGY_CHANGE({baseVersion, yaml, note})로 정의 전체를 보낼 때는 propose_ontology_change 가 더 맞습니다",
            ),
            "payload" to mapOf("type" to "object", "description" to "kind 별 제안 내용입니다"),
            "rationale" to string("사람이 승인할지 판단할 까닭. 2000자까지입니다"),
            "evidence" to mapOf(
                "type" to "object",
                "description" to "근거. 선택입니다",
                "properties" to mapOf(
                    "nodeIds" to strings("근거 항목 id. 20개까지입니다"),
                    "tradeIds" to strings("근거 체결 id. 50개까지입니다"),
                    "urls" to strings("근거 주소(http, https). 10개까지입니다"),
                ),
            ),
            "dedupeKey" to string("같은 해석이면 늘 같은 값이 되게 kind 와 대상 id 로 만든 키. 100자까지입니다. 다시 올릴 수 있는 제안에는 붙입니다"),
            required = listOf("kind", "payload", "rationale"),
        )
    }
}
