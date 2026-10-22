package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.ontology.Ontology
import org.slf4j.LoggerFactory
import org.springframework.core.io.Resource
import org.springframework.core.io.support.PathMatchingResourcePatternResolver
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.DeserializationFeature
import tools.jackson.dataformat.yaml.YAMLMapper
import tools.jackson.module.kotlin.kotlinModule
import tools.jackson.module.kotlin.readValue

/**
 * classpath 의 seeds 폴더에 있는 YAML 파일을 파일 이름 순서로 한 번씩 적용한다. docs/data-schema.md 「초기 데이터」.
 * 파일 하나가 트랜잭션 하나다. 실패하면 그 파일만 롤백하고 warn 로그를 남긴 뒤 다음 파일로 간다.
 * 초기 데이터는 없어도 API 를 쓸 수 있으므로 어떤 실패도 시작을 막지 않고, 다음 시작 때 다시 시도한다.
 */
@Component
class SeedLoader(
    private val client: Neo4jClient,
    private val nodes: NodeService,
    private val relationships: RelationshipService,
    private val ontology: Ontology,
    private val properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private val perFile = TransactionTemplate(transactionManager).apply {
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    /** 적용한 파일 수를 돌려준다. 예외를 밖으로 던지지 않는다 */
    fun run(): Int {
        if (!properties.seeds.enabled) return 0
        val files = try {
            readFiles()
        } catch (e: Exception) {
            log.warn("초기 데이터 파일 목록을 읽지 못했다: {}", e.message)
            return 0
        }
        var applied = 0
        files.forEach { file ->
            try {
                if (alreadyApplied(file.key)) return@forEach
                applyInTransaction(file)
                applied++
            } catch (e: Exception) {
                log.warn("초기 데이터 {} 를 적용하지 못했다: {}", file.key, e.message)
            }
        }
        if (applied > 0) log.info("초기 데이터 적용: {}개 파일", applied)
        return applied
    }

    /** 파일 하나를 트랜잭션 하나로 적용한다. 노드, 관계, 적용 기록이 함께 커밋되거나 함께 롤백된다 */
    internal fun applyInTransaction(file: SeedFile) {
        perFile.execute { apply(file) }
    }

    /** 바깥 트랜잭션 안에서 부른다. 서비스가 던진 예외는 잡지 않는다(잡아도 트랜잭션은 rollback-only 다) */
    internal fun apply(file: SeedFile) {
        val ids = mutableMapOf<String, String>()
        file.nodes.forEach { node ->
            // 이름이 없으면 기존 노드에 묶지 않고 생성 검증이 실패하게 둔다
            val name = node.properties[ontology.requireNodeType(node.type).labelProperty]?.toString()
            ids[node.ref] = name?.let { findExisting(node.type, it) }
                ?: nodes.create(CreateNodeRequest(node.type, node.properties), BootstrapAdmin.SYSTEM_ACTOR).id
        }
        file.relationships.forEach { rel ->
            val fromId = ids[rel.from]
            val toId = ids[rel.to]
            if (fromId == null || toId == null) {
                log.warn("초기 데이터 {} 의 관계 {} → {} 는 노드를 찾지 못해 건너뛴다", file.key, rel.from, rel.to)
                return@forEach
            }
            if (!relationshipExists(rel.type, fromId, toId)) {
                relationships.create(CreateRelationshipRequest(rel.type, fromId, toId), BootstrapAdmin.SYSTEM_ACTOR)
            }
        }
        client.query("CREATE (:SeedRun {key: \$key, appliedAt: \$now})")
            .bindAll(mapOf("key" to file.key, "now" to Timestamps.now())).run()
    }

    /** 같은 타입에 같은 이름(앞뒤 공백과 대소문자 무시)의 보관되지 않은 노드 id. 없으면 null */
    internal fun findExisting(type: String, name: String): String? {
        val labelProperty = ontology.requireNodeType(type).labelProperty
        return client.query(
            """
            MATCH (n:Knowledge)
            WHERE n.type = ${'$'}type AND n.archived = false AND toLower(trim(n[${'$'}prop])) = toLower(trim(${'$'}name))
            RETURN n.id AS id ORDER BY n.createdAt, n.id LIMIT 1
            """,
        ).bindAll(mapOf("type" to type, "prop" to labelProperty, "name" to name))
            .fetch().one().map { it["id"] as String }.orElse(null)
    }

    // 관계 타입은 온톨로지의 허용 목록에서 확인한 값만 Cypher 에 넣는다
    private fun relationshipExists(type: String, fromId: String, toId: String): Boolean {
        ontology.requireRelationshipType(type)
        return client.query(
            "MATCH (:Knowledge {id: \$from})-[r:`$type`]->(:Knowledge {id: \$to}) WHERE r.archived = false RETURN count(r) > 0 AS found",
        ).bindAll(mapOf("from" to fromId, "to" to toId)).fetch().one().map { it["found"] == true }.orElse(false)
    }

    private fun alreadyApplied(key: String): Boolean =
        client.query("MATCH (s:SeedRun {key: \$key}) RETURN count(s) > 0 AS found")
            .bind(key).to("key").fetch().one().map { it["found"] == true }.orElse(false)

    /** 읽지 못한 파일과 이미 나온 key 의 파일은 건너뛴다 */
    private fun readFiles(): List<SeedFile> {
        val seen = mutableSetOf<String>()
        return PathMatchingResourcePatternResolver().getResources(PATTERN)
            .sortedBy { it.filename }
            .mapNotNull { resource ->
                val file = read(resource) ?: return@mapNotNull null
                if (seen.add(file.key)) file else {
                    log.warn("초기 데이터 파일 {} 의 key {} 가 이미 나왔다. 건너뛴다", resource.filename, file.key)
                    null
                }
            }
    }

    private fun read(resource: Resource): SeedFile? = try {
        resource.inputStream.use { mapper.readValue<SeedFile>(it) }
    } catch (e: Exception) {
        log.warn("초기 데이터 파일 {} 를 읽지 못했다: {}", resource.filename, e.message)
        null
    }

    companion object {
        const val PATTERN = "classpath*:seeds/*.yaml"

        /** 키 오타가 조용히 사라지지 않게 알 수 없는 키는 읽기 실패로 본다(온톨로지 로더와 같은 규칙) */
        private val mapper = YAMLMapper.builder().addModule(kotlinModule()).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()
    }
}

data class SeedFile(val key: String, val nodes: List<SeedNode> = emptyList(), val relationships: List<SeedRelationship> = emptyList())

/** ref 는 이 파일 안에서만 쓰는 이름이다 */
data class SeedNode(val ref: String, val type: String, val properties: Map<String, Any?> = emptyMap())

data class SeedRelationship(val type: String, val from: String, val to: String)
