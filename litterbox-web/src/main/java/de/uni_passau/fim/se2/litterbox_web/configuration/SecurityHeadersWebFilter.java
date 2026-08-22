/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.configuration;

import java.util.regex.Pattern;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

@Component
public class SecurityHeadersWebFilter implements WebFilter {

    private static final String CONTENT_SECURITY_POLICY = "default-src 'self'; img-src 'self' data:; style-src 'self'; "
        + "script-src 'self' 'wasm-unsafe-eval'; "
        + "style-src-attr 'unsafe-hashes' 'sha256-17uPHovMxd3t/dCzUeSptM/l876X+D7WnB/OjkfSsc4='; "
        + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

    /**
     * Costume assets are learner-supplied and may be vectors, which are documents rather than pixels. This policy, not
     * the admission check the bytes passed on the way in, is what contains them: {@code default-src 'none'} means a
     * costume fetches nothing — no stylesheet it imports, no image its CSS names, whichever spelling it reaches for —
     * and {@code sandbox} puts a directly navigated one in an opaque origin, so it cannot reach the application either.
     *
     * <p>
     * {@code img-src data:} is the one hole, and only for inline raster data the costume already carries, which is the
     * form Scratch embeds bitmaps in. It admits no origin, so it fetches nothing.
     */
    private static final String ASSET_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; "
        + "img-src data:; sandbox";

    /** The API answers both with and without the application prefix, depending on how it is fronted. */
    private static final Pattern ASSET_PATH = Pattern.compile(
        "^(?:/litterbox)?/api/v\\d+/submissions/[^/]+/assets/[^/]+$"
    );

    @Override
    public Mono<Void> filter(final ServerWebExchange exchange, final WebFilterChain chain) {
        final HttpHeaders headers = exchange.getResponse().getHeaders();
        final boolean asset = ASSET_PATH.matcher(exchange.getRequest().getPath().value()).matches();
        headers.set("Content-Security-Policy", asset ? ASSET_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY);
        headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
        headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Frame-Options", "DENY");
        return chain.filter(exchange);
    }
}
