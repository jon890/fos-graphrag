package dev.fos.workbench.config

/** Neo4jClient.bindAll 은 null 을 받지 못하는 타입으로 선언돼 있지만 드라이버는 null parameter 를 받는다. */
@Suppress("UNCHECKED_CAST")
fun params(vararg pairs: Pair<String, Any?>): Map<String, Any> = mapOf(*pairs) as Map<String, Any>
