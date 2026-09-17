/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.net.URI;

import org.springframework.http.HttpStatus;

/** Ask AI problem details returned by {@code WebUiExceptionTranslator}. */
public final class AskAiProblemException extends RuntimeException {

    private static final String PROBLEM_TYPE_PREFIX = "urn:litterbox:problem:ask-ai-";
    private static final String CODE_PREFIX = "ask_ai_";

    private final Reason reason;

    private AskAiProblemException(final Reason reason) {
        super(reason.message);
        this.reason = reason;
    }

    private AskAiProblemException(final Reason reason, final Throwable cause) {
        super(reason.message, cause);
        this.reason = reason;
    }

    public static AskAiProblemException unavailable() {
        return new AskAiProblemException(Reason.UNAVAILABLE);
    }

    public static AskAiProblemException attemptsExhausted() {
        return new AskAiProblemException(Reason.ATTEMPTS_EXHAUSTED);
    }

    public static AskAiProblemException capacityExhausted() {
        return new AskAiProblemException(Reason.CAPACITY_EXHAUSTED);
    }

    /**
     * Hides which retained-context check failed.
     *
     * @return a problem describing unavailable retained context
     */
    public static AskAiProblemException contextNotFound() {
        return new AskAiProblemException(Reason.CONTEXT_NOT_FOUND);
    }

    public static AskAiProblemException idempotencyConflict() {
        return new AskAiProblemException(Reason.IDEMPOTENCY_CONFLICT);
    }

    public static AskAiProblemException invalidModelResponse(final Throwable cause) {
        return new AskAiProblemException(Reason.INVALID_MODEL_RESPONSE, cause);
    }

    public static AskAiProblemException providerUnavailable(final Throwable cause) {
        return new AskAiProblemException(Reason.PROVIDER_UNAVAILABLE, cause);
    }

    public static AskAiProblemException quotaExhausted() {
        return new AskAiProblemException(Reason.QUOTA_EXHAUSTED);
    }

    public static AskAiProblemException timeout(final Throwable cause) {
        return new AskAiProblemException(Reason.TIMEOUT, cause);
    }

    public static AskAiProblemException turnInProgress() {
        return new AskAiProblemException(Reason.TURN_IN_PROGRESS);
    }

    public Reason reason() {
        return reason;
    }

    public HttpStatus status() {
        return reason.status;
    }

    public URI type() {
        return reason.type;
    }

    public String title() {
        return reason.title;
    }

    public String code() {
        return reason.code;
    }

    /**
     * Whether the response for this problem carries a {@code Retry-After: 1} header.
     *
     * @return whether the client should retry after one second
     */
    public boolean retryAfter() {
        return reason.retryAfter;
    }

    public enum Reason {

        UNAVAILABLE(
            "Ask AI is not enabled",
            HttpStatus.SERVICE_UNAVAILABLE,
            "unavailable",
            "Ask AI unavailable",
            false
        ),

        /**
         * Distinct from {@link #QUOTA_EXHAUSTED}: the conversation may well have replies left, but too many turns have
         * gone wrong for it to be given another, so the client must not tell the reader the replies are spent.
         */
        ATTEMPTS_EXHAUSTED(
            "Ask AI conversation has had too many failed turns",
            HttpStatus.TOO_MANY_REQUESTS,
            "attempts_exhausted",
            "Ask AI attempts exhausted",
            false
        ),

        CAPACITY_EXHAUSTED(
            "Ask AI is at its concurrent generation limit",
            HttpStatus.SERVICE_UNAVAILABLE,
            "capacity_exhausted",
            "Ask AI capacity exhausted",
            true
        ),

        /** Generic to avoid revealing which context check failed. */
        CONTEXT_NOT_FOUND(
            "Ask AI context not found",
            HttpStatus.NOT_FOUND,
            "context_not_found",
            "Ask AI context not found",
            false
        ),

        IDEMPOTENCY_CONFLICT(
            "Ask AI client message id is already bound to a different message",
            HttpStatus.CONFLICT,
            "idempotency_conflict",
            "Ask AI idempotency conflict",
            false
        ),

        INVALID_MODEL_RESPONSE(
            "Ask AI model response failed validation",
            HttpStatus.BAD_GATEWAY,
            "invalid_model_response",
            "Ask AI model response was invalid",
            false
        ),

        /** Generic so provider response bodies never reach the client. */
        PROVIDER_UNAVAILABLE(
            "Ask AI provider is unavailable",
            HttpStatus.SERVICE_UNAVAILABLE,
            "provider_unavailable",
            "Ask AI provider unavailable",
            true
        ),

        /** Generic so the client is not told which quota was reached. */
        QUOTA_EXHAUSTED(
            "Ask AI quota is exhausted",
            HttpStatus.TOO_MANY_REQUESTS,
            "quota_exhausted",
            "Ask AI quota exhausted",
            true
        ),

        TIMEOUT(
            "Ask AI provider timed out",
            HttpStatus.GATEWAY_TIMEOUT,
            "timeout",
            "Ask AI timed out",
            false
        ),

        /** Retryable while the original send is still being answered. */
        TURN_IN_PROGRESS(
            "Ask AI is still answering this message",
            HttpStatus.CONFLICT,
            "turn_in_progress",
            "Ask AI turn in progress",
            true
        );

        private final String message;
        private final HttpStatus status;
        private final URI type;
        private final String title;
        private final String code;
        private final boolean retryAfter;

        Reason(
            final String message,
            final HttpStatus status,
            final String identifier,
            final String title,
            final boolean retryAfter
        ) {
            this.message = message;
            this.status = status;
            this.type = URI.create(PROBLEM_TYPE_PREFIX + identifier.replace('_', '-'));
            this.title = title;
            this.code = CODE_PREFIX + identifier;
            this.retryAfter = retryAfter;
        }
    }
}
