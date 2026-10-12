/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.configuration;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.jpa.autoconfigure.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Runs the migrations, and runs them before anything reads the schema.
 *
 * <p>
 * Spring Boot ships this together with an ordering rule, but in a module this does not depend on, so the bean is
 * declared here — and a bean alone says nothing about when it is built. The ordering only shows against an empty
 * database: with the tables already in place either order works, while without them Hibernate validates the mapping
 * first and refuses to start for want of the tables the migration is about to create.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
    prefix = "spring.flyway",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class DatabaseMigrationConfiguration {

    @Bean(initMethod = "migrate")
    public Flyway flyway(final DataSource dataSource) {
        return Flyway.configure().dataSource(dataSource).load();
    }

    /**
     * Hibernate is mapped against whatever the migrations leave behind, so it may not be built before they run.
     *
     * @return the ordering post-processor
     */
    @Bean
    public static EntityManagerFactoryDependsOnPostProcessor migrateBeforeMapping() {
        return new EntityManagerFactoryDependsOnPostProcessor("flyway");
    }
}
