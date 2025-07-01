# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from docker.io/library/maven:3-eclipse-temurin-21-alpine as builder

workdir /app

copy pom.xml .
copy src ./src

run mvn package -DskipTests

################################################################################

from docker.io/library/eclipse-temurin:21-alpine

run : \
    && addgroup -S spring \
    && adduser -S spring -G spring \
    && :

user spring:spring

workdir /app

copy --from=builder /app/target/litterbox-web*.jar /app/litterbox-web.jar

expose 8080

entrypoint ["java", "-jar", "litterbox-web.jar"]
