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

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Everything the one-off import of the old site needs that cannot be read out of the old database.
 *
 * <p>
 * The two directories are the old web root's own: uploads holds the projects children sent, reports holds the JSON the
 * old command line wrote beside them. Both are read, never written.
 */
@ConfigurationProperties(prefix = "litterbox.legacy-migration")
public class LegacyMigrationProperties {

    /** JDBC URL of the old schema. Read-only; it is opened read-only and rolled back. */
    private String sourceUrl;

    private String sourceUsername;

    private String sourcePassword;

    /** The old web root's {@code uploads} directory. */
    private Path uploadsRoot;

    /** The old web root's {@code litterbox} directory, where the reports were written. */
    private Path reportRoot;

    /** Where the new service keeps source artifacts; the imported projects are copied in here. */
    private Path artifactStoreRoot;

    /** Where to write the migration report. Its directory also receives the manifest of what was imported. */
    private Path reportOutput = Path.of("legacy-migration-report.json");

    /** The language the old site's reports were written in. */
    private String locale = "de";

    /** What to record as having produced the imported reports. */
    private String litterboxArtifactVersion = "legacy";

    /** Legacy {@code institution} values, mapped to the school types the new schema keeps. */
    private Map<String, String> approvedSchoolTypes = new LinkedHashMap<>();

    /** Legacy programme id to the share token it should keep, for the few whose tokens collide. */
    private Map<Long, String> tokenResolutions = new LinkedHashMap<>();

    /** Legacy question id to the programme it belongs to, where the filename join is ambiguous. */
    private Map<Long, Long> questionResolutions = new LinkedHashMap<>();

    /** Report what would happen and roll it back, rather than committing. */
    private boolean dryRun;

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(final String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public String getSourceUsername() {
        return sourceUsername;
    }

    public void setSourceUsername(final String sourceUsername) {
        this.sourceUsername = sourceUsername;
    }

    public String getSourcePassword() {
        return sourcePassword;
    }

    public void setSourcePassword(final String sourcePassword) {
        this.sourcePassword = sourcePassword;
    }

    public Path getUploadsRoot() {
        return uploadsRoot;
    }

    public void setUploadsRoot(final Path uploadsRoot) {
        this.uploadsRoot = uploadsRoot;
    }

    public Path getReportRoot() {
        return reportRoot;
    }

    public void setReportRoot(final Path reportRoot) {
        this.reportRoot = reportRoot;
    }

    public Path getArtifactStoreRoot() {
        return artifactStoreRoot;
    }

    public void setArtifactStoreRoot(final Path artifactStoreRoot) {
        this.artifactStoreRoot = artifactStoreRoot;
    }

    public Path getReportOutput() {
        return reportOutput;
    }

    public void setReportOutput(final Path reportOutput) {
        this.reportOutput = reportOutput;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(final String locale) {
        this.locale = locale;
    }

    public String getLitterboxArtifactVersion() {
        return litterboxArtifactVersion;
    }

    public void setLitterboxArtifactVersion(final String litterboxArtifactVersion) {
        this.litterboxArtifactVersion = litterboxArtifactVersion;
    }

    public Map<String, String> getApprovedSchoolTypes() {
        return approvedSchoolTypes;
    }

    public void setApprovedSchoolTypes(final Map<String, String> approvedSchoolTypes) {
        this.approvedSchoolTypes = approvedSchoolTypes;
    }

    public Map<Long, String> getTokenResolutions() {
        return tokenResolutions;
    }

    public void setTokenResolutions(final Map<Long, String> tokenResolutions) {
        this.tokenResolutions = tokenResolutions;
    }

    public Map<Long, Long> getQuestionResolutions() {
        return questionResolutions;
    }

    public void setQuestionResolutions(final Map<Long, Long> questionResolutions) {
        this.questionResolutions = questionResolutions;
    }

    public boolean isDryRun() {
        return dryRun;
    }

    public void setDryRun(final boolean dryRun) {
        this.dryRun = dryRun;
    }
}
