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

import java.net.URI;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IdempotencyKeyRepository.IdempotencyConflictException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.StorageCapacityExceededException;

/**
 * Translates the failures that only the web UI's own endpoints can raise.
 *
 * <p>
 * Scoped to {@code web_ui} rather than declared application-wide: the queues, the artifact store, and the idempotency
 * table exist for this package alone, so an advice that answered for every controller would be advertising states the
 * other endpoints cannot reach.
 */
@ControllerAdvice(basePackages = WebUiExceptionTranslator.WEB_UI_PACKAGE)
public class WebUiExceptionTranslator {

    static final String WEB_UI_PACKAGE = "de.uni_passau.fim.se2.litterbox_web.web_ui";

    private static final URI ANALYSIS_CAPACITY_TYPE = URI.create("urn:litterbox:problem:analysis-capacity-exhausted");
    private static final URI DATABASE_CAPACITY_TYPE = URI.create("urn:litterbox:problem:database-capacity-exhausted");
    private static final URI STORAGE_CAPACITY_TYPE = URI.create("urn:litterbox:problem:storage-capacity-exhausted");
    private static final URI IDEMPOTENCY_CONFLICT_TYPE = URI.create("urn:litterbox:problem:idempotency-conflict");

    @ExceptionHandler
    public ResponseEntity<ProblemDetail> handleCapabilityException(final CapabilityException exception) {
        final ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
        problem.setType(URI.create("urn:litterbox:problem:" + exception.code().replace('_', '-')));
        problem.setTitle("Capability request failed");
        problem.setProperty("code", exception.code());
        final ResponseEntity.BodyBuilder response = ResponseEntity.status(exception.status());
        if (exception.status() == HttpStatus.SERVICE_UNAVAILABLE) {
            response.header(HttpHeaders.RETRY_AFTER, "1");
        }
        return response.body(problem);
    }

    /** Returns the stable overload response for rejected CPU analysis work. */
    @ExceptionHandler
    public ResponseEntity<ProblemDetail> handleAnalysisCapacityExceeded(
        final AnalysisCapacityExceededException exception
    ) {
        return capacityExceeded(
            exception.getMessage(),
            ANALYSIS_CAPACITY_TYPE,
            "Analysis capacity exhausted",
            "analysis_capacity_exhausted"
        );
    }

    /** Returns the stable overload response for rejected database work. */
    @ExceptionHandler
    public ResponseEntity<ProblemDetail> handleDatabaseCapacityExceeded(
        final DatabaseCapacityExceededException exception
    ) {
        return capacityExceeded(
            exception.getMessage(),
            DATABASE_CAPACITY_TYPE,
            "Database capacity exhausted",
            "database_capacity_exhausted"
        );
    }

    /**
     * Returns the stable overload response for rejected artifact-store work.
     *
     * <p>
     * Told apart from the database's because they are separate resources: this one says the store is busy reading and
     * moving files, which says nothing about whether the database can take a query.
     */
    @ExceptionHandler
    public ResponseEntity<ProblemDetail> handleStorageCapacityExceeded(
        final StorageCapacityExceededException exception
    ) {
        return capacityExceeded(
            exception.getMessage(),
            STORAGE_CAPACITY_TYPE,
            "Source storage capacity exhausted",
            "storage_capacity_exhausted"
        );
    }

    private ResponseEntity<ProblemDetail> capacityExceeded(
        final String detail,
        final URI type,
        final String title,
        final String code
    ) {
        final ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, detail);
        problem.setType(type);
        problem.setTitle(title);
        problem.setProperty("code", code);

        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .header(HttpHeaders.RETRY_AFTER, "1")
            .body(problem);
    }

    @ExceptionHandler
    public ResponseEntity<ProblemDetail> handleIdempotencyConflict(final IdempotencyConflictException exception) {
        final ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
        problem.setType(IDEMPOTENCY_CONFLICT_TYPE);
        problem.setTitle("Idempotency conflict");
        problem.setProperty("code", "idempotency_conflict");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
    }
}
