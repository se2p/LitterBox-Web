/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Objects;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;

/**
 * Runs the import of the old site once and stops.
 *
 * <p>
 * Under the {@code legacy-migration} profile the service does not serve anything — migrating and taking traffic are not
 * things to do at the same time — and the process ends when the import does, with a status that says whether it worked.
 */
@Component
@Profile("legacy-migration")
@EnableConfigurationProperties(LegacyMigrationProperties.class)
public class LegacyMigrationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyMigrationRunner.class);

    private final LegacyMigrationProperties properties;
    private final DataSource target;
    private final ApplicationContext context;
    private final Scratch3ParserService parser;
    private final String analysisVersion;

    public LegacyMigrationRunner(
        final LegacyMigrationProperties properties,
        final DataSource target,
        final ApplicationContext context,
        final Scratch3ParserService parser,
        @Value("${litterbox.version:unknown}") final String analysisVersion
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.target = Objects.requireNonNull(target, "target");
        this.context = Objects.requireNonNull(context, "context");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.analysisVersion = Objects.requireNonNull(analysisVersion, "analysisVersion");
    }

    @Override
    public void run(final ApplicationArguments args) {
        int status = 0;
        try {
            command().run();
        }
        catch (LegacyMigrationException exception) {
            log.error("The legacy source data was refused. Nothing was written.", exception);
            exception.diagnostics().forEach(
                diagnostic -> log.error(
                    "  {} {}.{}: {} ({})", diagnostic.code(), diagnostic.table(), diagnostic.column(),
                    diagnostic.detail(), diagnostic.count()
                )
            );
            status = 1;
        }
        catch (RuntimeException | IOException | SQLException exception) {
            log.error("The legacy migration failed. Nothing was written.", exception);
            status = 1;
        }
        final int exitCode = status;
        System.exit(SpringApplication.exit(context, () -> exitCode));
    }

    private LegacyMigrationCommand command() {
        if (properties.getSourceUrl() == null || properties.getSourceUrl().isBlank()) {
            throw new IllegalStateException("litterbox.legacy-migration.source-url must be set");
        }
        final DriverManagerDataSource source = new DriverManagerDataSource();
        source.setUrl(properties.getSourceUrl());
        source.setUsername(properties.getSourceUsername());
        source.setPassword(properties.getSourcePassword());
        return new LegacyMigrationCommand(
            properties, source, target, new LegacyProgramParseVerifier(parser, analysisVersion)
        );
    }
}
