/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import jakarta.persistence.EntityManagerFactory;

/**
 * The mappings and the migration are two descriptions of one schema, written by hand, and nothing but this stops them
 * drifting apart. Hibernate is asked to check every table, column and type it was told about against the database
 * Flyway actually built, and to refuse if any of it is missing or a different shape.
 *
 * <p>
 * This is what makes {@code ddl-auto: validate} worth setting: in production it fails at startup, and here it fails in
 * the build instead.
 */
class SchemaMappingTest {

    @Test
    void everyEntityMatchesTheMigratedSchema() {
        try (TestDatabase database = TestDatabase.freshSchema("schema_mapping")) {
            database.migrated();

            final LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(database.dataSource());
            factory.setPackagesToScan("de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(validatingProperties());
            factory.afterPropertiesSet();

            try (EntityManagerFactory built = factory.getObject()) {
                assertThat(built).isNotNull();
                assertThat(built.getMetamodel().getEntities())
                    .as("every mapped table should have been checked")
                    .hasSize(18);
            }
            finally {
                factory.destroy();
            }
        }
    }

    private Map<String, Object> validatingProperties() {
        final Map<String, Object> properties = new HashMap<>();
        properties.put("hibernate.hbm2ddl.auto", "validate");
        return properties;
    }
}
