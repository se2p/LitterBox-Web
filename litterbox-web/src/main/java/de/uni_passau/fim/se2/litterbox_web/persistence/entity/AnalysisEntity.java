/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Maps the {@code analysis} table. Rows are read and written by the repositories; none escapes one. */
@Entity
@Table(name = "analysis")
public class AnalysisEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "submission_id")
    private long submissionId;

    @Column(name = "source_artifact_id")
    private long sourceArtifactId;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "provenance")
    private String provenance;

    @Column(name = "report_schema_version")
    private String reportSchemaVersion;

    @Column(name = "litterbox_artifact_version")
    private String litterboxArtifactVersion;

    @Column(name = "detector_set")
    private String detectorSet;

    @Column(
        name = "configuration_json",
        columnDefinition = "LONGTEXT"
    )
    private String configurationJson;

    @Column(name = "locale")
    private String locale;

    @Column(
        name = "input_sha256",
        columnDefinition = "BINARY(32)"
    )
    private byte[] inputSha256;

    @Column(name = "input_format")
    private String inputFormat;

    @Column(
        name = "report_json",
        columnDefinition = "LONGTEXT"
    )
    private String reportJson;

    @Column(name = "status")
    private String status;

    @Column(name = "failure_type")
    private String failureType;

    @Column(
        name = "failure_message",
        columnDefinition = "TEXT"
    )
    private String failureMessage;

    /**
     * Whether this is the analysis the submission's creation made.
     *
     * <p>
     * A submission is created from one request, and the database holds it to one such analysis so that a request
     * repeated after the first attempt died resumes rather than starts a second. Running the same project again
     * afterwards is not that, and leaves this false.
     */
    @Column(name = "from_creation")
    private boolean fromCreation;

    /**
     * An analysis that has been recorded but not yet run, which is the only shape anything creates one in.
     *
     * @param projectName the name the project came in under, or {@code null} for a submission of a single project,
     *                    where there is no name to tell it apart from
     */
    @SuppressWarnings("checkstyle:ParameterNumber")
    public static AnalysisEntity queued(
        final long submissionId,
        final long sourceArtifactId,
        final String projectName,
        final String provenance,
        final String reportSchemaVersion,
        final String litterboxArtifactVersion,
        final String locale,
        final byte[] inputSha256,
        final String inputFormat
    ) {
        final AnalysisEntity entity = new AnalysisEntity();
        entity.setSubmissionId(submissionId);
        entity.setSourceArtifactId(sourceArtifactId);
        entity.setProjectName(projectName);
        entity.setProvenance(provenance);
        entity.setReportSchemaVersion(reportSchemaVersion);
        entity.setLitterboxArtifactVersion(litterboxArtifactVersion);
        entity.setLocale(locale);
        entity.setInputSha256(inputSha256);
        entity.setInputFormat(inputFormat);
        entity.setStatus("QUEUED");
        return entity;
    }

    public Long getId() {
        return id;
    }

    public void setId(final Long id) {
        this.id = id;
    }

    public long getSubmissionId() {
        return submissionId;
    }

    public void setSubmissionId(final long submissionId) {
        this.submissionId = submissionId;
    }

    public long getSourceArtifactId() {
        return sourceArtifactId;
    }

    public void setSourceArtifactId(final long sourceArtifactId) {
        this.sourceArtifactId = sourceArtifactId;
    }

    public void setFromCreation(final boolean fromCreation) {
        this.fromCreation = fromCreation;
    }

    public String getProjectName() {
        return projectName;
    }

    public void setProjectName(final String projectName) {
        this.projectName = projectName;
    }

    public String getProvenance() {
        return provenance;
    }

    public void setProvenance(final String provenance) {
        this.provenance = provenance;
    }

    public String getReportSchemaVersion() {
        return reportSchemaVersion;
    }

    public void setReportSchemaVersion(final String reportSchemaVersion) {
        this.reportSchemaVersion = reportSchemaVersion;
    }

    public String getLitterboxArtifactVersion() {
        return litterboxArtifactVersion;
    }

    public void setLitterboxArtifactVersion(final String litterboxArtifactVersion) {
        this.litterboxArtifactVersion = litterboxArtifactVersion;
    }

    public String getDetectorSet() {
        return detectorSet;
    }

    public String getConfigurationJson() {
        return configurationJson;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(final String locale) {
        this.locale = locale;
    }

    public byte[] getInputSha256() {
        return inputSha256;
    }

    public void setInputSha256(final byte[] inputSha256) {
        this.inputSha256 = inputSha256;
    }

    public String getInputFormat() {
        return inputFormat;
    }

    public void setInputFormat(final String inputFormat) {
        this.inputFormat = inputFormat;
    }

    public String getReportJson() {
        return reportJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(final String status) {
        this.status = status;
    }

    public String getFailureType() {
        return failureType;
    }

    public String getFailureMessage() {
        return failureMessage;
    }

}
