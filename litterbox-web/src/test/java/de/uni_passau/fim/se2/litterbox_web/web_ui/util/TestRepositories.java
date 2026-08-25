/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.util;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import javax.sql.DataSource;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.ReadCommittedTransactions;
import jakarta.persistence.EntityManagerFactory;

/**
 * Spring Data repositories over a real database.
 *
 * <p>
 * The tests that need these are checking what only a real MariaDB can answer — an upsert, a window function, two
 * writers meeting on one row. Mocking the repository would ask the mock instead.
 *
 * <p>
 * This builds the same wiring the application has rather than a lighter imitation of it. A repository handed out by
 * {@code JpaRepositoryFactory} alone is not transactional, so a save is never flushed and a generated key never comes
 * back: the imitation fails in a way that looks like a bug in the code under test.
 */
public final class TestRepositories implements AutoCloseable {

    private static DataSource dataSource;

    private final AnnotationConfigApplicationContext context;

    public TestRepositories(final TestDatabase database) {
        Objects.requireNonNull(database, "database");
        synchronized (TestRepositories.class) {
            dataSource = database.dataSource();
            context = new AnnotationConfigApplicationContext(PersistenceConfiguration.class);
        }
    }

    /** Hands out a repository exactly as the application receives it, transactions and all. */
    public <T> T of(final Class<T> repositoryInterface) {
        return context.getBean(repositoryInterface);
    }

    public EntityManagerFactory entityManagerFactory() {
        return context.getBean(EntityManagerFactory.class);
    }

    public PlatformTransactionManager transactionManager() {
        return context.getBean(PlatformTransactionManager.class);
    }

    /** The transactions the repositories run their writes in, isolated as the application isolates them. */
    public ReadCommittedTransactions transactions() {
        return new ReadCommittedTransactions(transactionManager());
    }

    @Override
    public void close() {
        context.close();
    }

    /**
     * The persistence half of the application, over whichever schema the surrounding test made.
     *
     * <p>
     * Marked as test configuration rather than plain configuration because this package is inside the one the
     * application scans: as a {@code @Configuration} it would be picked up by every {@code @SpringBootTest} in the
     * build and asked to connect to a schema that another test had already dropped.
     */
    @TestConfiguration
    @EnableJpaRepositories(basePackages = "de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa")
    static class PersistenceConfiguration {

        @Bean
        DataSource testDataSource() {
            return dataSource;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(final DataSource source) {
            final LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(source);
            factory.setPackagesToScan("de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            final Map<String, Object> properties = new HashMap<>();
            properties.put("hibernate.hbm2ddl.auto", "validate");
            properties.put("hibernate.jdbc.batch_size", "32");
            properties.put("hibernate.order_inserts", "true");
            // So a test can ask how much work a call actually asked the database for.
            properties.put("hibernate.generate_statistics", "true");
            factory.setJpaPropertyMap(properties);
            return factory;
        }

        @Bean
        PlatformTransactionManager transactionManager(final EntityManagerFactory factory) {
            return new JpaTransactionManager(factory);
        }
    }
}
