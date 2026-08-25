/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities;

import java.util.Objects;

import org.springframework.http.HttpStatus;

/** Failures returned by advanced capability endpoints. */
public final class CapabilityException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public CapabilityException(final HttpStatus status, final String code, final String detail) {
        super(detail);
        this.status = Objects.requireNonNull(status, "status");
        this.code = requireCode(code);
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static CapabilityException disabled() {
        return new CapabilityException(HttpStatus.NOT_FOUND, "capability_disabled", "Capability not found");
    }

    public static CapabilityException unavailable() {
        return new CapabilityException(
            HttpStatus.SERVICE_UNAVAILABLE, "capability_unavailable", "Capability is temporarily unavailable"
        );
    }

    public static CapabilityException authorizationRequired() {
        return new CapabilityException(
            HttpStatus.UNAUTHORIZED, "authorization_required", "Matching submission authorization is required"
        );
    }

    public static CapabilityException analysisNotFound() {
        return new CapabilityException(HttpStatus.NOT_FOUND, "analysis_not_found", "Analysis not found");
    }

    public static CapabilityException analysisNotReady() {
        return new CapabilityException(HttpStatus.CONFLICT, "analysis_not_ready", "Analysis is not ready");
    }

    public static CapabilityException limitExceeded() {
        return new CapabilityException(
            HttpStatus.PAYLOAD_TOO_LARGE, "capability_limit_exceeded", "Capability resource limit exceeded"
        );
    }

    public static CapabilityException timedOut() {
        return new CapabilityException(
            HttpStatus.GATEWAY_TIMEOUT, "capability_timeout", "Capability request timed out"
        );
    }

    public static CapabilityException unsupportedSourceFormat() {
        return new CapabilityException(
            HttpStatus.UNPROCESSABLE_CONTENT, "unsupported_source_format", "Source format is not supported"
        );
    }

    public static CapabilityException targetNotFound() {
        return new CapabilityException(HttpStatus.UNPROCESSABLE_CONTENT, "target_not_found", "Target was not found");
    }

    public static CapabilityException noApplicableMutation() {
        return new CapabilityException(
            HttpStatus.UNPROCESSABLE_CONTENT, "no_applicable_mutation", "No applicable mutation was found"
        );
    }

    private static String requireCode(final String code) {
        if (code == null || !code.matches("[a-z][a-z0-9_]{2,63}")) {
            throw new IllegalArgumentException("Capability error code is invalid");
        }
        return code;
    }
}
