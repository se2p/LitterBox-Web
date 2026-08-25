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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisMetricEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisJobs;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisMetrics;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionEvents;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Submissions;
import reactor.core.publisher.Mono;

@Repository
public class AnalysisRepository {

    private final Analyses analyses;
    private final AnalysisMetrics analysisMetrics;
    private final AnalysisJobs jobs;
    private final SubmissionEvents events;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;
    private final SubmissionProgress progress;

    @Autowired
    @SuppressWarnings("checkstyle:ParameterNumber")
    public AnalysisRepository(
        final Analyses analyses,
        final AnalysisMetrics analysisMetrics,
        final AnalysisJobs jobs,
        final Submissions submissions,
        final SubmissionEvents events,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.analysisMetrics = Objects.requireNonNull(analysisMetrics, "analysisMetrics");
        this.jobs = Objects.requireNonNull(jobs, "jobs");
        this.events = Objects.requireNonNull(events, "events");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        progress = new SubmissionProgress(submissions);
    }

    /**
     * The analysis for the single project a submission holds, created if the submission has none yet.
     *
     * <p>
     * A request that bound its idempotency key and then died leaves a submission with nothing under it; a repeat of
     * that request finishes the work rather than reporting a submission nothing will ever run. Two repeats can both
     * find it empty, so the unique key on a submission's creation analysis decides between them. The loser re-reads the
     * winner's row in a fresh transaction, because its own failed statement cannot see it.
     *
     * <p>
     * That key covers only analyses marked as belonging to a submission's creation, so running the project again later
     * — under a newer LitterBox, or a different configuration — inserts a new row instead of returning the first
     * attempt's result.
     */
    public Mono<Analysis> createAttempt(final AnalysisAttempt attempt) {
        Objects.requireNonNull(attempt, "attempt");
        return databaseWork.submit(() -> createAttemptInDatabase(attempt));
    }

    /** The creation analysis a submission already has, if it got as far as making one. */
    public Mono<Analysis> findCreationBySubmissionId(final long submissionId) {
        return databaseWork.submit(
            () -> withMetrics(
                analyses.findFirstBySubmissionIdAndFromCreationIsTrueAndProjectNameIsNullOrderById(submissionId)
                    .map(AnalysisRepository::toAnalysis).orElse(null)
            )
        );
    }

    private Analysis createAttemptInDatabase(final AnalysisAttempt attempt) {
        try {
            final AnalysisEntity queued = AnalysisEntity.queued(
                attempt.submissionId(), attempt.sourceArtifactId(), null, attempt.provenance(),
                attempt.reportSchemaVersion(), attempt.litterboxArtifactVersion(), attempt.locale(),
                attempt.inputSha256(), attempt.inputFormat()
            );
            queued.setFromCreation(true);
            return toAnalysis(analyses.saveAndFlush(queued));
        }
        catch (DataIntegrityViolationException alreadyAttempted) {
            return analyses.findFirstBySubmissionIdAndFromCreationIsTrueAndProjectNameIsNullOrderById(
                attempt.submissionId()
            )
                .map(AnalysisRepository::toAnalysis)
                .orElseThrow(() -> alreadyAttempted);
        }
    }

    public Mono<Analysis> findLatestBySubmissionId(final long submissionId) {
        return databaseWork.submit(
            () -> withMetrics(
                analyses.findFirstBySubmissionIdOrderByIdDesc(submissionId)
                    .map(AnalysisRepository::toAnalysis).orElse(null)
            )
        );
    }

    public Mono<Analysis> findById(final long analysisId) {
        return databaseWork.submit(
            () -> withMetrics(analyses.findById(analysisId).map(AnalysisRepository::toAnalysis).orElse(null))
        );
    }

    public Mono<Analysis> findBySubmissionAndProjectName(final long submissionId, final String projectName) {
        Objects.requireNonNull(projectName, "projectName");
        return databaseWork.submit(
            () -> withMetrics(
                analyses.findFirstBySubmissionIdAndProjectNameOrderById(submissionId, projectName)
                    .map(AnalysisRepository::toAnalysis).orElse(null)
            )
        );
    }

    public Mono<List<Analysis>> findBySubmissionId(final long submissionId) {
        return databaseWork.submit(() -> findBySubmissionInDatabase(submissionId));
    }

    private List<Analysis> findBySubmissionInDatabase(final long submissionId) {
        final List<Analysis> found = analyses.findBySubmissionIdOrderById(submissionId).stream()
            .map(AnalysisRepository::toAnalysis)
            .toList();
        if (found.isEmpty()) {
            return found;
        }
        final Map<Long, Map<String, Double>> measured = new LinkedHashMap<>();
        analysisMetrics.findByAnalysisIdInOrderByAnalysisIdAscNameAsc(found.stream().map(Analysis::id).toList())
            .forEach(
                metric -> measured.computeIfAbsent(metric.getAnalysisId(), ignored -> new LinkedHashMap<>())
                    .put(metric.getName(), metric.getValue())
            );
        return found.stream()
            .map(analysis -> withMetrics(analysis, measured.getOrDefault(analysis.id(), Map.of())))
            .toList();
    }

    private static Analysis toAnalysis(final AnalysisEntity entity) {
        return new Analysis(
            entity.getId(), entity.getSubmissionId(), entity.getSourceArtifactId(), entity.getProjectName(),
            entity.getProvenance(), entity.getReportSchemaVersion(), entity.getLitterboxArtifactVersion(),
            entity.getLocale(), entity.getStatus(), entity.getInputFormat(), entity.getReportJson(),
            entity.getFailureType(), entity.getFailureMessage(), entity.getDetectorSet(),
            entity.getConfigurationJson(), entity.getInputSha256(), Map.of()
        );
    }

    private Analysis withMetrics(final Analysis analysis) {
        if (analysis == null) {
            return null;
        }
        final Map<String, Double> metrics = new LinkedHashMap<>();
        analysisMetrics.findByAnalysisIdOrderByName(analysis.id())
            .forEach(metric -> metrics.put(metric.getName(), metric.getValue()));
        return withMetrics(analysis, metrics);
    }

    private Analysis withMetrics(final Analysis analysis, final Map<String, Double> metrics) {
        return new Analysis(
            analysis.id(), analysis.submissionId(), analysis.sourceArtifactId(), analysis.projectName(),
            analysis.provenance(), analysis.reportSchemaVersion(), analysis.litterboxArtifactVersion(),
            analysis.locale(), analysis.status(), analysis.inputFormat(), analysis.reportJson(),
            analysis.failureType(), analysis.failureMessage(), analysis.detectorSet(), analysis.configurationJson(),
            analysis.inputSha256(), metrics
        );
    }

    /**
     * Records the outcome of an analysis, provided the job it ran under is still leased to this worker.
     *
     * <p>
     * Without that condition a worker whose lease was taken over would overwrite the result of the run that replaced
     * it.
     */
    public Mono<Boolean> completeIfOwned(
        final long analysisId, final long submissionId, final boolean failed,
        final String reportJson, final String failureType, final String failureMessage, final String eventPayload,
        final String detectorSet, final String configurationJson, final Map<String, Double> metrics,
        final long jobId, final String workerId
    ) {
        Objects.requireNonNull(workerId, "workerId");
        return databaseWork.submit(
            () -> transactions.execute(
                status -> completeInTransaction(
                    analysisId, submissionId, failed, reportJson, failureType, failureMessage, eventPayload,
                    detectorSet, configurationJson, metrics, jobId, workerId
                )
            )
        );
    }

    private boolean completeInTransaction(
        final long analysisId, final long submissionId, final boolean failed,
        final String reportJson, final String failureType, final String failureMessage, final String eventPayload,
        final String detectorSet, final String configurationJson, final Map<String, Double> metrics,
        final long jobId, final String workerId
    ) {
        if (leaseNotOwned(jobId, analysisId, submissionId, workerId)) {
            return false;
        }
        if (progress.counts(submissionId).finished()) {
            return false;
        }
        final String analysisStatus = failed ? "FAILED" : "DONE";
        final int updated = analyses.complete(
            analysisId, submissionId, analysisStatus, reportJson, failureType, failureMessage, detectorSet,
            configurationJson
        );
        if (updated == 0) {
            return false;
        }
        storeMetrics(analysisId, metrics);
        progress.recordOutcome(submissionId, failed);
        events.append(submissionId, analysisStatus, eventPayload);
        return true;
    }

    private boolean leaseNotOwned(
        final long jobId,
        final long analysisId,
        final long submissionId,
        final String workerId
    ) {
        return jobs
            .findHeldLease(jobId, workerId)
            .filter(
                job -> job.getSubmissionId() == submissionId && !job.isCancelRequested()
                    && Objects.equals(job.getAnalysisId(), analysisId)
            )
            .isEmpty();
    }

    private void storeMetrics(final long analysisId, final Map<String, Double> metrics) {
        if (metrics == null) {
            return;
        }
        analysisMetrics.deleteByAnalysisId(analysisId);
        analysisMetrics.insertAll(
            metrics.entrySet().stream()
                // The driver writes NaN and infinity out as bare words, which the database reads as column names
                // and rejects, failing the whole analysis over a single unmeasurable ratio. Skipped instead.
                .filter(entry -> entry.getValue() != null && Double.isFinite(entry.getValue()))
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> metric(analysisId, entry.getKey(), entry.getValue()))
                .toList()
        );
    }

    private static AnalysisMetricEntity metric(final long analysisId, final String name, final double value) {
        final AnalysisMetricEntity entity = new AnalysisMetricEntity();
        entity.setAnalysisId(analysisId);
        entity.setName(name);
        entity.setValue(value);
        return entity;
    }

    public Mono<Void> updateStatus(
        final long analysisId, final String status, final String failureType,
        final String failureMessage, final String reportJson
    ) {
        Objects.requireNonNull(status, "status");
        return databaseWork.submit(() -> {
            analyses.recordOutcome(analysisId, status, failureType, failureMessage, reportJson);
            return null;
        });
    }

    public Mono<Void> setAnalysisConfiguration(
        final long analysisId, final String detectorSet, final String configurationJson
    ) {
        Objects.requireNonNull(detectorSet, "detectorSet");
        Objects.requireNonNull(configurationJson, "configurationJson");
        return databaseWork.submit(() -> {
            analyses.setConfiguration(analysisId, detectorSet, configurationJson);
            return null;
        });
    }

    public record AnalysisAttempt(
        long submissionId, long sourceArtifactId, String provenance,
        String reportSchemaVersion, String litterboxArtifactVersion, String locale, byte[] inputSha256,
        String inputFormat
    ) {

        public AnalysisAttempt {
            Objects.requireNonNull(provenance, "provenance");
            Objects.requireNonNull(reportSchemaVersion, "reportSchemaVersion");
            Objects.requireNonNull(litterboxArtifactVersion, "litterboxArtifactVersion");
            Objects.requireNonNull(locale, "locale");
            if (inputSha256 != null) {
                if (inputSha256.length != 32) {
                    throw new IllegalArgumentException("SHA-256 digest must contain 32 bytes");
                }
                inputSha256 = inputSha256.clone();
            }
        }

        @Override
        public byte[] inputSha256() {
            return inputSha256 == null ? null : inputSha256.clone();
        }
    }
}
