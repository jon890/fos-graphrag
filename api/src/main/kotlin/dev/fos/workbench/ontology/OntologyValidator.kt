package dev.fos.workbench.ontology

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.web.OntologyViolationException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Component
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException

/**
 * 온톨로지 정의로 사용자 속성을 검증하고 저장할 값으로 바꾼다.
 * 반환 맵의 값은 Neo4j 에 그대로 넣을 수 있는 String, Double, Long, Boolean 이다.
 */
@Component
class OntologyValidator(private val holder: OntologyHolder) {

    /** 생성할 노드의 속성 전체를 검증한다. 필수 속성이 모두 있어야 한다. */
    fun validateCreate(type: String, properties: Map<String, Any?>): Map<String, Any> {
        val def = holder.current().requireNodeType(type)
        rejectUnknown(type, def, properties.keys)
        val errors = linkedMapOf<String, String>()
        val result = linkedMapOf<String, Any>()
        def.properties.forEach { (name, p) ->
            val value = normalize(name, p, properties[name], errors)
            if (value != null) result[name] = value
            else if (p.required && name !in errors) errors[name] = "필수 값입니다."
        }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        return result
    }

    /**
     * 수정할 속성만 검증한다. 값이 null 이면 그 속성을 지운다는 뜻이고 필수 속성은 지울 수 없다.
     * 반환 맵의 null 값은 삭제를 뜻한다.
     */
    fun validatePatch(type: String, changes: Map<String, Any?>): Map<String, Any?> {
        val def = holder.current().requireNodeType(type)
        rejectUnknown(type, def, changes.keys)
        val errors = linkedMapOf<String, String>()
        val result = linkedMapOf<String, Any?>()
        changes.forEach { (name, raw) ->
            val p = def.properties.getValue(name)
            val value = normalize(name, p, raw, errors)
            if (value == null && p.required && name !in errors) errors[name] = "필수 값은 지울 수 없습니다."
            if (name !in errors) result[name] = value
        }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        return result
    }

    private fun rejectUnknown(type: String, def: NodeTypeDef, names: Set<String>) {
        val unknown = names - def.properties.keys
        if (unknown.isNotEmpty()) {
            throw OntologyViolationException("unknown-property", "$type 타입에 정의되지 않은 속성입니다: ${unknown.sorted().joinToString()}")
        }
    }

    private fun normalize(name: String, p: PropertyDef, raw: Any?, errors: MutableMap<String, String>): Any? {
        if (raw == null) return null
        if (raw is String && raw.isBlank()) return null
        val value: Any? = when (p.type) {
            PropertyType.STRING, PropertyType.TEXT -> (raw as? String)?.trim()
            PropertyType.URL -> (raw as? String)?.trim()?.takeIf(::isHttpUrl)
            PropertyType.ENUM -> (raw as? String)?.trim()?.takeIf { it in p.values.orEmpty() }
            PropertyType.DATE -> (raw as? String)?.let { parseOrNull { LocalDate.parse(it.trim()).toString() } }
            PropertyType.DATETIME -> (raw as? String)?.let { parseOrNull { Timestamps.user(parseInstant(it.trim())) } }
            PropertyType.NUMBER -> (raw as? Number)?.toDouble()?.takeIf { it.isFinite() }
            PropertyType.INTEGER -> (raw as? Number)?.takeIf { it.toDouble() % 1.0 == 0.0 }?.toLong()
            PropertyType.BOOLEAN -> raw as? Boolean
        }
        if (value == null) {
            errors[name] = typeMessage(p)
            return null
        }
        if (value is String && p.maxLength != null && value.length > p.maxLength) {
            errors[name] = "${p.maxLength}자 이하여야 합니다."
            return null
        }
        if (value is Number) {
            val d = value.toDouble()
            if ((p.min != null && d < p.min) || (p.max != null && d > p.max)) {
                errors[name] = "${p.min ?: "-∞"} 이상 ${p.max ?: "∞"} 이하여야 합니다."
                return null
            }
        }
        return value
    }

    private fun typeMessage(p: PropertyDef): String = when (p.type) {
        PropertyType.URL -> "http 또는 https 로 시작하는 URL 이어야 합니다."
        PropertyType.ENUM -> "다음 값 가운데 하나여야 합니다: ${p.values.orEmpty().joinToString()}"
        PropertyType.DATE -> "YYYY-MM-DD 형식이어야 합니다."
        PropertyType.DATETIME -> "ISO-8601 시각이어야 합니다."
        PropertyType.NUMBER -> "숫자여야 합니다."
        PropertyType.INTEGER -> "정수여야 합니다."
        PropertyType.BOOLEAN -> "true 나 false 여야 합니다."
        PropertyType.STRING, PropertyType.TEXT -> "문자열이어야 합니다."
    }

    private fun <T> parseOrNull(block: () -> T): T? = try {
        block()
    } catch (_: DateTimeParseException) {
        null
    }

    private fun parseInstant(s: String): Instant =
        runCatching { Instant.parse(s) }.getOrElse { OffsetDateTime.parse(s).withOffsetSameInstant(ZoneOffset.UTC).toInstant() }

    private fun isHttpUrl(s: String): Boolean = runCatching {
        val uri = URI(s)
        (uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank()
    }.getOrDefault(false)
}
