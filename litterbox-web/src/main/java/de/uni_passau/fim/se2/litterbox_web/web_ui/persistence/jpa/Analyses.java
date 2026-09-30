/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisEntity;

public interface Analyses extends JpaRepository<AnalysisEntity, Long> {

    @Modifying
    @Transactional
    @Query(
        value = "UPDATE analysis SET assessment_count = assessment_count + 1 "
            + "WHERE id = :analysisId AND assessment_count < :maximum",
        nativeQuery = true
    )
    int claimAssessmentSlot(@Param("analysisId") long analysisId, @Param("maximum") int maximum);

    @Modifying
    @Transactional
    @Query(
        value = "UPDATE analysis SET assessment_count = assessment_count - 1 "
            + "WHERE id = :analysisId AND assessment_count > 0",
        nativeQuery = true
    )
    int releaseAssessmentSlot(@Param("analysisId") long analysisId);

    List<AnalysisEntity> findBySubmissionIdOrderById(long submissionId);

    Optional<AnalysisEntity> findFirstBySubmissionIdOrderByIdDesc(long submissionId);

    Optional<AnalysisEntity> findFirstBySubmissionIdAndProjectNameOrderById(long submissionId, String projectName);

    /**
     * The analysis a submission's creation made of its single project, which the unique key on it guarantees is at most
     * one.
     */
    Optional<AnalysisEntity> findFirstBySubmissionIdAndFromCreationIsTrueAndProjectNameIsNullOrderById(
        long submissionId
    );

    /**
     * The analysis a batch's creation made of one of its projects, as against one run over that project since.
     *
     * <p>
     * Asking for the creation and not merely for the name is what lets a project be analysed again: a second run makes
     * a row of its own, and a worker still unpacking the archive must not be handed it as the row it was about to
     * insert.
     */
    Optional<AnalysisEntity> findFirstBySubmissionIdAndProjectNameAndFromCreationIsTrueOrderById(
        long submissionId, String projectName
    );

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :analysisId AND status IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    void cancel(@Param("analysisId") long analysisId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET status = 'FAILED', failure_type = 'RetryExhausted', "
            + "failure_message = 'The work could not be recovered', completed_at = CURRENT_TIMESTAMP(6) "
            + "WHERE id = :analysisId AND submission_id = :submissionId AND status IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    int exhaust(@Param("analysisId") long analysisId, @Param("submissionId") long submissionId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET detector_set = :detectorSet, configuration_json = :configurationJson "
            + "WHERE id = :analysisId",
        nativeQuery = true
    )
    void setConfiguration(
        @Param("analysisId") long analysisId,
        @Param("detectorSet") String detectorSet,
        @Param("configurationJson") String configurationJson
    );

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP(6) "
            + "WHERE submission_id = :submissionId AND status IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    void cancelSubmission(@Param("submissionId") long submissionId);

    /**
     * Records what an analysis came to, but only while it is still waiting or running. A second worker arriving with an
     * answer for work already answered changes nothing, and is told so by the row count.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET status = :status, report_json = :reportJson, failure_type = :failureType, "
            + "failure_message = :failureMessage, detector_set = COALESCE(:detectorSet, detector_set), "
            + "configuration_json = COALESCE(:configurationJson, configuration_json), "
            + "completed_at = CURRENT_TIMESTAMP(6) WHERE id = :analysisId AND submission_id = :submissionId "
            + "AND status IN ('QUEUED', 'RUNNING')",
        nativeQuery = true
    )
    @SuppressWarnings("checkstyle:ParameterNumber")
    int complete(
        @Param("analysisId") long analysisId,
        @Param("submissionId") long submissionId,
        @Param("status") String status,
        @Param("reportJson") String reportJson,
        @Param("failureType") String failureType,
        @Param("failureMessage") String failureMessage,
        @Param("detectorSet") String detectorSet,
        @Param("configurationJson") String configurationJson
    );

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
        value = "UPDATE analysis SET status = :status, failure_type = :failureType, "
            + "failure_message = :failureMessage, report_json = :reportJson, "
            + "completed_at = CASE WHEN :status IN ('DONE', 'FAILED') THEN CURRENT_TIMESTAMP(6) "
            + "ELSE completed_at END WHERE id = :analysisId "
            + "AND status NOT IN ('DONE', 'FAILED', 'CANCELLED') "
            + "AND EXISTS (SELECT 1 FROM submission WHERE submission.id = analysis.submission_id "
            + "AND submission.state <> 'CANCELLED')",
        nativeQuery = true
    )
    @SuppressWarnings("checkstyle:ParameterNumber")
    int recordOutcome(
        @Param("analysisId") long analysisId,
        @Param("status") String status,
        @Param("failureType") String failureType,
        @Param("failureMessage") String failureMessage,
        @Param("reportJson") String reportJson
    );
}
