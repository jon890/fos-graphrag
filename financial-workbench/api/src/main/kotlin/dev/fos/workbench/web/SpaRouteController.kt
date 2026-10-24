package dev.fos.workbench.web

import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping

/** 화면 경로의 GET 을 index.html 로 넘긴다. 경로 목록은 docs/flow.md 「주소와 뒤로가기」 의 표와 같다 */
@Controller
class SpaRouteController {

    @GetMapping("/map", "/workspace", "/list", "/review", "/changes", "/ontology", "/users")
    fun route(): String = "forward:/index.html"
}
