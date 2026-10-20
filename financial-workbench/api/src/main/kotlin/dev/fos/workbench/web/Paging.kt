package dev.fos.workbench.web

data class Page<T>(
    val items: List<T>,
    val page: Int,
    val size: Int,
    val totalItems: Long,
    val totalPages: Int,
)

/** 페이지 쿼리 값. 범위는 docs/api-contract.md 「페이지네이션」 절이다. */
data class PageQuery(val page: Int, val size: Int) {
    val skip: Long get() = page.toLong() * size

    fun <T> of(items: List<T>, total: Long): Page<T> =
        Page(items, page, size, total, if (total == 0L) 0 else ((total + size - 1) / size).toInt())

    companion object {
        const val MAX_SIZE = 100

        fun of(page: Int?, size: Int?): PageQuery {
            val p = page ?: 0
            val s = size ?: 20
            val errors = buildMap {
                if (p < 0) put("page", "0 이상이어야 합니다.")
                if (s !in 1..MAX_SIZE) put("size", "1 이상 $MAX_SIZE 이하여야 합니다.")
            }
            if (errors.isNotEmpty()) throw ValidationFailedException(errors)
            return PageQuery(p, s)
        }
    }
}
