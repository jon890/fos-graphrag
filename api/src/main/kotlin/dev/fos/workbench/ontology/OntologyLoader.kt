package dev.fos.workbench.ontology

import org.springframework.core.io.ClassPathResource
import tools.jackson.core.JacksonException
import tools.jackson.core.JsonToken
import tools.jackson.databind.DatabindException
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.JsonNode
import tools.jackson.databind.exc.UnrecognizedPropertyException
import tools.jackson.dataformat.yaml.YAMLMapper
import tools.jackson.module.kotlin.kotlinModule
import tools.jackson.module.kotlin.readValue
import java.io.InputStream

/** ADMIN 이 보낸 정의를 읽고 검사한 결과. 정의는 코드 소유 부분을 저장소 값으로 바꾼 것이다 */
sealed interface EditRead {
    /** 보낸 값 가운데 코드가 소유해 무시한 경로(`CodeOwned.ignoredPaths`) */
    val codeOwnedIgnored: List<String>

    data class Valid(val ontology: Ontology, override val codeOwnedIgnored: List<String> = emptyList()) : EditRead

    /** 읽기에 성공했으면 [ontology] 에 합친 정의가 있다. 읽지 못했으면 null 이다 */
    data class Invalid(val errors: List<String>, val ontology: Ontology?, override val codeOwnedIgnored: List<String> = emptyList()) : EditRead
}

object OntologyLoader {
    const val RESOURCE = "financial-ontology.yaml"
    private val HEX_COLOR = Regex("^#[0-9a-fA-F]{6}$")
    private val NODE_TYPE_KEY = Regex("^[A-Z][A-Za-z0-9]*$")
    private val UPPER_SNAKE_KEY = Regex("^[A-Z][A-Z0-9_]*$")
    private val PROPERTY_KEY = Regex("^[a-z][A-Za-z0-9]*$")

    /** API 가 직접 쓰는 노드 속성 이름. 온톨로지가 이 이름을 정의하면 사용자가 시스템 값을 덮어쓸 수 있어 시작을 막는다. */
    val RESERVED_PROPERTIES = setOf(
        "id", "type", "revision", "archived", "archivedAt", "createdAt", "createdBy", "updatedAt", "updatedBy",
        "searchText", "reviewStatus", "reviewedBy", "reviewedAt", "reviewNote", "contentUpdatedBy",
    )

    /** 서버 코드가 지식 그래프 밖의 저장에 쓰는 노드 label(docs/data-schema.md 「코드가 소유하는 이름」) */
    val RESERVED_NODE_TYPES = setOf(
        "Knowledge", "User", "IntegrationToken", "Trade", "Proposal", "ChangeEvent", "OntologyVersion", "OntologyHead", "SeedRun",
    )

    /** 서버 코드가 지식 그래프 밖의 저장에 쓰는 관계 종류 */
    val RESERVED_RELATIONSHIP_TYPES = setOf("OWNS", "KNOWS", "OF_SECURITY", "EXECUTES")

    /**
     * 알 수 없는 키는 시작을 막는다. YAML 흐름 표기에서 쉼표로 잘린 값(`{ description: 예 GICS, KSIC }` 의 `KSIC`)이나
     * 키 오타가 조용히 사라져 화면에 잘린 설명이 나가는 것을 시작 때 잡기 위해서다.
     */
    private val mapper = YAMLMapper.builder().addModule(kotlinModule()).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()

    /** 읽은 뒤 Claim predicate 선택지를 만들고 일관성을 검사한다. 오류가 있으면 첫 오류로 IllegalArgumentException 이다 */
    fun load(input: InputStream): Ontology {
        val o = withDerivedClaimPredicate(input.use { mapper.readValue<Ontology>(it) })
        val errors = consistencyErrors(o)
        require(errors.isEmpty()) { errors.first() }
        return o
    }

    fun parse(text: String): Ontology = load(text.byteInputStream())

    /** [parse] 로 다시 읽으면 같은 값이 나오는 YAML. 저장하는 버전의 yaml 이 이것이다 */
    fun toYaml(o: Ontology): String = mapper.writeValueAsString(o)

    /**
     * Claim 의 predicate 선택지는 claimPredicates 하나에서 만든다. 웹에서 주장 종류를 더하거나 빼거나 이름을 바꾸면
     * managedBy 가 claims 인 타입의 predicate enum 도 따라온다. values 는 claimPredicates 의 키, valueLabels 는 그 label 이다.
     * 파일에 적은 valueLabels 는 values 안에 있으면서 label 이 없는 키만 남는다(파생 값이 이긴다).
     */
    internal fun withDerivedClaimPredicate(o: Ontology): Ontology {
        val values = o.claimPredicates.keys.toList()
        val predicateLabels = o.claimPredicates.mapNotNull { (key, def) -> def.label?.let { key to it } }.toMap()
        return o.copy(
            nodeTypes = o.nodeTypes.mapValues { (_, type) ->
                val predicate = type.properties["predicate"]
                if (type.managedBy != "claims" || predicate == null || predicate.type != PropertyType.ENUM) {
                    type
                } else {
                    val fileLabels = predicate.valueLabels.orEmpty()
                    val labels = values.mapNotNull { key -> (predicateLabels[key] ?: fileLabels[key])?.let { key to it } }.toMap()
                    type.copy(properties = type.properties + ("predicate" to predicate.copy(values = values, valueLabels = labels.ifEmpty { null })))
                }
            },
        )
    }

    /** 편집기가 보낸 YAML 을 읽고 검사한다. [latest] 는 더한 키를 가려내는 데 쓴다 */
    fun readEdited(text: String, latest: Ontology): EditRead = readEdited(latest, text) { mapper.readValue(text, Ontology::class.java) }

    /** 편집 폼이 보낸 JSON 정의를 읽고 검사한다 */
    fun readEdited(definition: JsonNode, latest: Ontology): EditRead =
        readEdited(latest, null) { mapper.treeToValue(definition, Ontology::class.java) }

    /**
     * 읽기, 코드 소유 부분 합치기(Claim predicate 선택지 포함), 일관성 검사, 코드가 이름으로 읽는 키 검사, managedBy 검사,
     * 더한 키의 형식 검사 순서다. 오류 문장에는 클래스 이름이나 Jackson 의 원래 메시지를 담지 않는다.
     */
    private fun readEdited(latest: Ontology, text: String?, read: () -> Ontology?): EditRead {
        val edited = try {
            read() ?: return EditRead.Invalid(listOf("YAML 을 읽지 못했습니다"), null)
        } catch (e: UnrecognizedPropertyException) {
            return EditRead.Invalid(listOf("알 수 없는 키 ${e.propertyName}${lineSuffix(lineOf(text, e))}"), null)
        } catch (e: DatabindException) {
            val path = e.path.joinToString(".") { it.propertyName ?: it.index.toString() }
            return EditRead.Invalid(listOf("값의 형식이 맞지 않습니다: $path${lineSuffix(lineOf(text, e))}"), null)
        } catch (e: JacksonException) {
            return EditRead.Invalid(listOf("YAML 을 읽지 못했습니다${lineSuffix(e.location?.lineNr)}"), null)
        }
        val repo = loadDefault()
        val merged = CodeOwned.merge(edited, repo)
        val ignored = CodeOwned.ignoredPaths(edited, merged)
        val errors = consistencyErrors(merged) + CodeReadKeys.violations(merged, repo) + CodeOwned.errors(edited, repo) + newKeyErrors(merged, latest)
        return if (errors.isEmpty()) EditRead.Valid(merged, ignored) else EditRead.Invalid(errors, merged, ignored)
    }

    private fun lineSuffix(line: Int?): String = line?.takeIf { it > 0 }?.let { " (줄 $it)" }.orEmpty()

    /**
     * 오류가 난 키의 줄. 데이터 클래스는 생성자 인자를 객체 끝까지 모은 뒤 만들어서 예외의 위치가 객체 끝을 가리키므로,
     * 예외의 경로와 같은 경로의 키를 원문에서 다시 찾는다. 찾지 못하면 예외의 위치를 쓴다. JSON 정의로 보냈으면 줄이 없다.
     */
    private fun lineOf(text: String?, e: DatabindException): Int? {
        if (text == null) return null
        val target = e.path.joinToString("") { "/" + (it.propertyName?.replace("~", "~0")?.replace("/", "~1") ?: it.index.toString()) }
        return try {
            mapper.createParser(text).use { p ->
                generateSequence { p.nextToken() }
                    .firstOrNull { it == JsonToken.PROPERTY_NAME && p.streamReadContext().pathAsPointer().toString() == target }
                    ?.let { p.currentTokenLocation().lineNr }
            }
        } catch (_: JacksonException) {
            null
        } ?: e.location?.lineNr
    }

    /** [latest] 에 없던 키만 형식을 본다. 이미 있는 키는 그대로 둔다 */
    private fun newKeyErrors(o: Ontology, latest: Ontology): List<String> = buildList {
        (o.nodeTypes.keys - latest.nodeTypes.keys).sorted().filterNot { NODE_TYPE_KEY.matches(it) }
            .forEach { add("새 노드 타입 키는 영문 대문자로 시작하고 영문자와 숫자만 씁니다: $it") }
        (o.relationshipTypes.keys - latest.relationshipTypes.keys).sorted().filterNot { UPPER_SNAKE_KEY.matches(it) }
            .forEach { add("새 관계 종류 키는 영문 대문자로 시작하고 영문 대문자, 숫자, 밑줄만 씁니다: $it") }
        (o.claimPredicates.keys - latest.claimPredicates.keys).sorted().filterNot { UPPER_SNAKE_KEY.matches(it) }
            .forEach { add("새 주장 종류 키는 영문 대문자로 시작하고 영문 대문자, 숫자, 밑줄만 씁니다: $it") }
        o.nodeTypes.toSortedMap().forEach { (type, def) ->
            val known = latest.nodeTypes[type]?.properties?.keys.orEmpty()
            (def.properties.keys - known).sorted().filterNot { PROPERTY_KEY.matches(it) }
                .forEach { add("새 속성 키는 영문 소문자로 시작하고 영문자와 숫자만 씁니다: $type.$it") }
        }
    }

    fun loadDefault(): Ontology = load(ClassPathResource(RESOURCE).inputStream)

    /** 정의 안에서 가리키는 이름과 표기 규칙을 검사해 오류 문장을 모두 돌려준다. 비면 일관되다. */
    fun consistencyErrors(o: Ontology): List<String> = buildList {
        val types = o.nodeTypes.keys
        val referenced = o.relationshipTypes.values.flatMap { it.from + it.to } +
            o.claimRelationships.values.flatMap { it.from + it.to } +
            o.claimPredicates.values.flatMap { it.subjectTypes + it.objectTypes }
        val unknown = referenced.filterNot { it in types }
        if (unknown.isNotEmpty()) add("온톨로지가 정의하지 않은 타입을 가리킨다: $unknown")
        types.filter { it in RESERVED_NODE_TYPES }.forEach { add("$it 은 서버 코드가 쓰는 이름이라 노드 타입으로 쓸 수 없다") }
        o.allRelationshipTypes.filter { it in RESERVED_RELATIONSHIP_TYPES }.forEach { add("$it 은 서버 코드가 쓰는 이름이라 관계 종류로 쓸 수 없다") }
        o.nodeTypes.forEach { (name, def) ->
            if (def.labelProperty !in def.properties) add("$name 의 labelProperty 가 속성에 없다")
            val reserved = def.properties.keys.filter { it in RESERVED_PROPERTIES || it.startsWith("_") }
            if (reserved.isNotEmpty()) add("$name 이 시스템 속성 이름을 사용자 속성으로 정의한다: $reserved")
            val strayHints = def.hintProperties.filterNot { it in def.properties }
            if (strayHints.isNotEmpty()) add("$name 의 hintProperties 가 속성에 없는 이름을 가리킨다: $strayHints")
            val straySearch = def.searchProperties.filterNot { it in def.properties }
            if (straySearch.isNotEmpty()) add("$name 의 searchProperties 가 속성에 없는 이름을 가리킨다: $straySearch")
            def.display?.color?.let { if (!HEX_COLOR.matches(it)) add("$name 의 display.color 는 #rrggbb 형식이어야 한다: $it") }
            def.display?.shape?.let { if (it !in NodeDisplayDef.SHAPES) add("$name 의 display.shape 는 ${NodeDisplayDef.SHAPES} 가운데 하나여야 한다: $it") }
            def.properties.forEach { (prop, p) ->
                if (p.type == PropertyType.ENUM && p.values.isNullOrEmpty()) add("$name.$prop enum 에 values 가 없다")
                val stray = p.valueLabels.orEmpty().keys.filterNot { it in p.values.orEmpty() }
                if (stray.isNotEmpty()) add("$name.$prop 의 valueLabels 가 values 에 없는 값을 가리킨다: $stray")
                addAll(aliasErrors(name, prop, p))
            }
        }
        o.relationshipTypes.forEach { (name, def) ->
            val sentence = def.sentence ?: return@forEach
            if (sentence.split("{from}").size != 2 || sentence.split("{to}").size != 2) {
                add("$name 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다")
            }
        }
        if (!Regex("[A-Za-z][A-Za-z0-9_]*").let { r -> (types + o.allRelationshipTypes).all { r.matches(it) } }) {
            add("타입과 관계 이름은 영문자, 숫자, 밑줄만 쓴다")
        }
    }

    /** 예전 값 정리가 한 표기를 두 값으로 고치거나 목록 값을 다른 값으로 바꾸지 않게, 별칭이 서로와 values 와 겹치지 않는지 본다. */
    private fun aliasErrors(name: String, prop: String, p: PropertyDef): List<String> = buildList {
        val aliases = p.valueAliases ?: return@buildList
        if (p.type != PropertyType.ENUM) add("$name.$prop 의 valueAliases 는 enum 이 아닌 속성에 둘 수 없다")
        val stray = aliases.keys.filterNot { it in p.values.orEmpty() }
        if (stray.isNotEmpty()) add("$name.$prop 의 valueAliases 가 values 에 없는 값을 가리킨다: $stray")
        val normalizedValues = p.values.orEmpty().map { it.trim().lowercase() }.toSet()
        val seen = mutableSetOf<String>()
        val clashes = aliases.values.flatten().filter { alias ->
            val key = alias.trim().lowercase()
            key in normalizedValues || !seen.add(key)
        }
        if (clashes.isNotEmpty()) add("$name.$prop 의 valueAliases 가 겹치거나 values 와 같은 표기를 가진다: $clashes")
    }
}
