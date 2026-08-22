/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.util;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.MariaDBContainer;

/**
 * A MariaDB schema of its own for a test that needs a real database.
 *
 * <p>
 * Where that database comes from depends on where the build runs. On a developer machine it is a container this class
 * starts through Testcontainers. On a runner with no Docker daemon it is whichever server the pipeline names in
 * {@code LITTERBOX_TEST_DB_URL}, and the schemas are created inside it.
 *
 * <p>
 * What the tests using this check — what concurrent writers make of a unique key, generated columns, the order MariaDB
 * assigns in, {@code ON DUPLICATE KEY UPDATE}, window functions, and the migrations themselves — is exactly what an
 * in-memory stand-in would get wrong while appearing to pass. So there is no third route that quietly skips them: when
 * neither database is reachable this class fails and names the two ways to provide one.
 */
public final class TestDatabase implements AutoCloseable {

    private static final AtomicInteger SEQUENCE = new AtomicInteger();

    private final Server server;
    private final String schema;
    private final DriverManagerDataSource dataSource;

    private TestDatabase(final Server server, final String schema) {
        this.server = server;
        this.schema = schema;
        dataSource = new DriverManagerDataSource(server.baseUrl + schema, server.username, server.password);
    }

    /**
     * Creates an empty schema named after the given prefix, on whichever server this build has.
     *
     * <p>
     * Each call gets its own schema, so tests sharing one server still start from nothing.
     */
    public static TestDatabase freshSchema(final String prefix) {
        final Server server = Server.shared();
        final String schema = prefix.toLowerCase(Locale.ROOT) + "_" + SEQUENCE.incrementAndGet();
        server.execute("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
        return new TestDatabase(server, schema);
    }

    /** Applies the checked-in Flyway migrations to this schema. */
    public TestDatabase migrated() {
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        return this;
    }

    public String jdbcUrl() {
        return server.baseUrl + schema;
    }

    public String username() {
        return server.username;
    }

    public String password() {
        return server.password;
    }

    public DataSource dataSource() {
        return dataSource;
    }

    public JdbcTemplate jdbcTemplate() {
        return new JdbcTemplate(dataSource);
    }

    @Override
    public void close() {
        server.execute("DROP DATABASE IF EXISTS " + schema);
    }

    /**
     * The server the schemas live on, resolved once for the whole test run.
     *
     * <p>
     * Starting a container per test cost more than the tests did; one server with a schema each is both quicker and the
     * only shape an externally provided database can take.
     */
    private static final class Server {

        private static final String URL_SETTING = "LITTERBOX_TEST_DB_URL";
        private static final String USER_SETTING = "LITTERBOX_TEST_DB_USER";
        private static final String PASSWORD_SETTING = "LITTERBOX_TEST_DB_PASSWORD";
        private static final String IMAGE = "mariadb:11.4";

        private static Server instance;

        private final String baseUrl;
        private final String username;
        private final String password;

        private Server(final String baseUrl, final String username, final String password) {
            this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
            this.username = username;
            this.password = password;
        }

        static synchronized Server shared() {
            if (instance == null) {
                instance = advertised().orElseGet(Server::started);
            }
            return instance;
        }

        private static Optional<Server> advertised() {
            return setting(URL_SETTING).map(
                url -> new Server(
                    url, setting(USER_SETTING).orElse("root"), setting(PASSWORD_SETTING).orElse("")
                )
            );
        }

        private static Server started() {
            if (!DockerClientFactory.instance().isDockerAvailable()) {
                throw new IllegalStateException(
                    "These tests need a real MariaDB and there is none. Either start Docker, so Testcontainers "
                        + "can bring one up, or set " + URL_SETTING + " (with " + USER_SETTING + " and "
                        + PASSWORD_SETTING + ") to a server this build may create and drop schemas on."
                );
            }
            // The tests create a schema each, which the database's own account may do and a named one may not.
            final MariaDBContainer<?> container = new MariaDBContainer<>(IMAGE)
                .withDatabaseName("litterbox_synthetic")
                .withUsername("root")
                .withPassword("synthetic");
            container.start();
            Runtime.getRuntime().addShutdownHook(new Thread(container::stop));
            return new Server(
                "jdbc:mariadb://" + container.getHost() + ":" + container.getFirstMappedPort(),
                container.getUsername(), container.getPassword()
            );
        }

        private static Optional<String> setting(final String name) {
            final String property = System.getProperty(name.toLowerCase(Locale.ROOT).replace('_', '.'));
            final String value = property == null ? System.getenv(name) : property;
            return Optional.ofNullable(value).filter(candidate -> !candidate.isBlank());
        }

        private void execute(final String sql) {
            try (
                Connection connection = new DriverManagerDataSource(baseUrl, username, password).getConnection();
                Statement statement = connection.createStatement()
            ) {
                statement.execute(sql);
            }
            catch (SQLException exception) {
                throw new IllegalStateException("Could not run '" + sql + "' on " + baseUrl, exception);
            }
        }
    }
}
