package dev.fos.workbench

import dev.fos.workbench.auth.UserAddCommand
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import kotlin.system.exitProcess

@SpringBootApplication
@ConfigurationPropertiesScan
class WorkbenchApplication

fun main(args: Array<String>) {
    if (args.firstOrNull() == UserAddCommand.NAME) {
        exitProcess(UserAddCommand.run(args.drop(1)))
    }
    runApplication<WorkbenchApplication>(*args)
}
