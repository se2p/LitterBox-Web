/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.api.v1;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.FaultInjectionCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.GraphCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.ProgramExportCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.SemanticDiffCapability;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class AdvancedCapabilitiesController {

    public static final String GRAPH_MEDIA_TYPE = "text/vnd.graphviz;charset=UTF-8";
    public static final String ARCHIVE_MEDIA_TYPE = "application/zip";

    private static final Set<String> GRAPH_TYPES = Set.of("ast", "cfg", "cdg", "ddg", "dt", "pdt", "tdg", "pdg");
    private static final Map<String, DownloadType> EXPORT_TYPES = Map.of(
        "scratchblocks", new DownloadType("text/plain;charset=UTF-8", ".txt"),
        "goboscript", new DownloadType("text/plain;charset=UTF-8", ".gs"),
        "pystage", new DownloadType("text/x-python;charset=UTF-8", ".py")
    );

    private final AdvancedCapabilitiesConfiguration configuration;
    private final ObjectProvider<GraphCapability> graphCapability;
    private final ObjectProvider<SemanticDiffCapability> diffCapability;
    private final ObjectProvider<ProgramExportCapability> exportCapability;
    private final ObjectProvider<FaultInjectionCapability> injectionCapability;

    public AdvancedCapabilitiesController(
        final AdvancedCapabilitiesConfiguration configuration,
        final ObjectProvider<GraphCapability> graphCapability,
        final ObjectProvider<SemanticDiffCapability> diffCapability,
        final ObjectProvider<ProgramExportCapability> exportCapability,
        final ObjectProvider<FaultInjectionCapability> injectionCapability
    ) {
        this.configuration = configuration;
        this.graphCapability = graphCapability;
        this.diffCapability = diffCapability;
        this.exportCapability = exportCapability;
        this.injectionCapability = injectionCapability;
    }

    @GetMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/graphs/{graphType}",
        produces = GRAPH_MEDIA_TYPE
    )
    public Mono<ResponseEntity<String>> graph(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @PathVariable final String graphType,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        requireEnabled(configuration.getMetricsGraphs().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        final String normalizedType = graphType.toLowerCase(Locale.ROOT);
        if (!GRAPH_TYPES.contains(normalizedType) || !normalizedType.equals(graphType)) {
            return Mono.error(new IllegalArgumentException("Unsupported graph type"));
        }
        final GraphCapability operation = graphCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return operation.graph(submissionToken, analysisId, normalizedType).map(this::graphResponse);
    }

    @PostMapping(
        value = "/diffs",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<AdvancedCapabilityDtos.DiffView> diff(
        @RequestBody final AdvancedCapabilityDtos.DiffRequest request
    ) {
        requireEnabled(configuration.getSemanticDiff().isEnabled());
        requireReference(request == null ? null : request.before());
        requireReference(request.after());
        final SemanticDiffCapability operation = diffCapability.getIfAvailable();
        return operation == null
            ? Mono.error(CapabilityException.unavailable())
            : operation.compare(request);
    }

    @PostMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/exports",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = { "text/plain;charset=UTF-8", "text/x-python;charset=UTF-8" }
    )
    public Mono<ResponseEntity<byte[]>> export(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AdvancedCapabilityDtos.ExportRequest request
    ) {
        requireEnabled(configuration.getProgramExport().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        final DownloadType type = exportType(request);
        final ProgramExportCapability operation = exportCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return operation.export(submissionToken, analysisId, request)
            .map(
                content -> attachment(
                    content, type, "litterbox-export", configuration.getProgramExport().getMaxOutputBytes()
                )
            );
    }

    @GetMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/export-targets",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AdvancedCapabilityDtos.ExportTargetsView>> exportTargets(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization
    ) {
        requireEnabled(configuration.getProgramExport().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        final ProgramExportCapability operation = exportCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return operation.targets(submissionToken, analysisId).map(
            targets -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Content-Type-Options", "nosniff")
                .body(targets)
        );
    }

    @GetMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/injectors",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<List<AdvancedCapabilityDtos.InjectorView>> injectors(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestParam(defaultValue = "en") final String locale
    ) {
        requireEnabled(configuration.getFaultInjection().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        if (!ApiV1.SUPPORTED_LOCALES.contains(locale)) {
            return Mono.error(new IllegalArgumentException("Unsupported locale"));
        }
        final FaultInjectionCapability operation = injectionCapability.getIfAvailable();
        return operation == null
            ? Mono.error(CapabilityException.unavailable())
            : operation.injectors(submissionToken, analysisId, locale);
    }

    @GetMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/injector-catalogue",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<ResponseEntity<AdvancedCapabilityDtos.InjectorCatalogueView>> injectorCatalogue(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestParam(defaultValue = "en") final String locale
    ) {
        requireEnabled(configuration.getFaultInjection().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        if (!ApiV1.SUPPORTED_LOCALES.contains(locale)) {
            return Mono.error(new IllegalArgumentException("Unsupported locale"));
        }
        final FaultInjectionCapability operation = injectionCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return operation.injectorCatalogue(submissionToken, analysisId, locale).map(
            catalogue -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Content-Type-Options", "nosniff")
                .body(catalogue)
        );
    }

    @PostMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/injections",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Mono<AdvancedCapabilityDtos.InjectionPreview> previewInjection(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AdvancedCapabilityDtos.InjectionRequest request
    ) {
        requireEnabled(configuration.getFaultInjection().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        requireValidInjectorSelection(request);
        final FaultInjectionCapability operation = injectionCapability.getIfAvailable();
        return operation == null
            ? Mono.error(CapabilityException.unavailable())
            : operation.preview(submissionToken, analysisId, request).map(this::boundedPreview);
    }

    /** The preview and the complete download take the same selection, and must refuse the same ones. */
    private void requireValidInjectorSelection(final AdvancedCapabilityDtos.InjectionRequest request) {
        if (request == null || request.injectorIds() == null) {
            throw new IllegalArgumentException("Select at least one injector");
        }
        if (request.selectsAll()) {
            if (!request.injectorIds().isEmpty()) {
                throw new IllegalArgumentException("Injector selection is invalid");
            }
        }
        else if (request.injectorIds().isEmpty()) {
            throw new IllegalArgumentException("Select at least one injector");
        }
        if (!validInjectorCount(request) || hasInvalidInjector(request) || hasDuplicateInjectors(request)) {
            throw new IllegalArgumentException("Injector selection is invalid");
        }
    }

    private boolean validInjectorCount(final AdvancedCapabilityDtos.InjectionRequest request) {
        return request.selectsAll()
            || request.injectorIds().size() <= configuration.getFaultInjection().getMaxSelectedInjectors();
    }

    private boolean hasInvalidInjector(final AdvancedCapabilityDtos.InjectionRequest request) {
        return request.injectorIds().stream().anyMatch(id -> id == null || id.isBlank() || id.length() > 128);
    }

    private boolean hasDuplicateInjectors(final AdvancedCapabilityDtos.InjectionRequest request) {
        return new HashSet<>(request.injectorIds()).size() != request.injectorIds().size();
    }

    @PostMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/injections/download",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = ARCHIVE_MEDIA_TYPE
    )
    public Mono<ResponseEntity<byte[]>> downloadInjection(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AdvancedCapabilityDtos.InjectionDownloadRequest request
    ) {
        requireEnabled(configuration.getFaultInjection().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        if (request == null || request.injectorId() == null || request.injectorId().isBlank()) {
            return Mono.error(new IllegalArgumentException("Injector selection is required"));
        }
        if (request.resultIndex() < 0) {
            return Mono.error(new IllegalArgumentException("Mutation result index is invalid"));
        }
        final FaultInjectionCapability operation = injectionCapability.getIfAvailable();
        if (operation == null) {
            return Mono.error(CapabilityException.unavailable());
        }
        return operation.download(submissionToken, analysisId, request).map(this::archiveAttachment);
    }

    @PostMapping(
        value = "/submissions/{submissionToken}/analyses/{analysisId}/injections/download-all",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = ARCHIVE_MEDIA_TYPE
    )
    public Mono<ResponseEntity<byte[]>> downloadAllInjections(
        @PathVariable final String submissionToken,
        @PathVariable final long analysisId,
        @RequestHeader(
            name = HttpHeaders.AUTHORIZATION,
            required = false
        ) final String authorization,
        @RequestBody final AdvancedCapabilityDtos.InjectionRequest request
    ) {
        requireEnabled(configuration.getFaultInjection().isEnabled());
        requireMatchingBearer(submissionToken, authorization);
        requireValidInjectorSelection(request);
        final FaultInjectionCapability operation = injectionCapability.getIfAvailable();
        return operation == null
            ? Mono.error(CapabilityException.unavailable())
            : operation.downloadAll(submissionToken, analysisId, request).map(this::bundleAttachment);
    }

    private ResponseEntity<String> graphResponse(final GraphCapability.GraphResult graph) {
        final byte[] encoded = graph.dot().getBytes(StandardCharsets.UTF_8);
        final var limits = configuration.getMetricsGraphs();
        if (!validGraphSize(graph, encoded, limits)) {
            throw CapabilityException.limitExceeded();
        }
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType(GRAPH_MEDIA_TYPE))
            .contentLength(encoded.length)
            .header("X-Content-Type-Options", "nosniff")
            .header("X-LitterBox-Graph-Nodes", Integer.toString(graph.nodeCount()))
            .header("X-LitterBox-Graph-Edges", Integer.toString(graph.edgeCount()))
            .body(graph.dot());
    }

    private boolean validGraphSize(
        final GraphCapability.GraphResult graph,
        final byte[] encoded,
        final AdvancedCapabilitiesConfiguration.GraphLimits limits
    ) {
        if (graph.nodeCount() < 0 || graph.edgeCount() < 0) {
            return false;
        }
        if (graph.nodeCount() > limits.getMaxGraphNodes() || graph.edgeCount() > limits.getMaxGraphEdges()) {
            return false;
        }
        return encoded.length <= limits.getMaxDotBytes();
    }

    private ResponseEntity<byte[]> archiveAttachment(final CapabilityContent content) {
        final String extension = switch (content.sourceFormat()) {
            case "sb3" -> ".sb3";
            case "mblock" -> ".mblock";
            case null, default -> throw new IllegalStateException("Unsupported derived archive format");
        };
        return attachment(
            content,
            new DownloadType(ARCHIVE_MEDIA_TYPE, extension),
            "litterbox-derived",
            configuration.getFaultInjection().getMaxArchiveBytes()
        );
    }

    private ResponseEntity<byte[]> bundleAttachment(final CapabilityContent content) {
        if (!"zip".equals(content.sourceFormat())) {
            throw new IllegalStateException("Unsupported derived bundle format");
        }
        return attachment(
            content,
            new DownloadType(ARCHIVE_MEDIA_TYPE, ".zip"),
            "litterbox-derived-all",
            configuration.getFaultInjection().getMaxArchiveBytes()
        );
    }

    private ResponseEntity<byte[]> attachment(
        final CapabilityContent content,
        final DownloadType type,
        final String basename,
        final long maxBytes
    ) {
        final byte[] bytes = content.bytes();
        if (bytes.length > maxBytes) {
            throw CapabilityException.limitExceeded();
        }
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType(type.mediaType()))
            .contentLength(bytes.length)
            .header("X-Content-Type-Options", "nosniff")
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                    .filename(basename + type.extension(), StandardCharsets.UTF_8)
                    .build().toString()
            )
            .body(bytes);
    }

    private DownloadType exportType(final AdvancedCapabilityDtos.ExportRequest request) {
        if (request == null || request.format() == null || request.target() == null) {
            throw new IllegalArgumentException("Export format and target are required");
        }
        final DownloadType type = EXPORT_TYPES.get(request.format());
        if (type == null) {
            throw new IllegalArgumentException("Unsupported export format");
        }
        final AdvancedCapabilityDtos.ExportTarget target = request.target();
        validateExportTarget(target);
        return type;
    }

    private void validateExportTarget(final AdvancedCapabilityDtos.ExportTarget target) {
        switch (target.kind()) {
            case "program" -> validateProgramTarget(target);
            case "sprite" -> validateSpriteTarget(target);
            case "script" -> validateScriptTarget(target);
            case null, default -> throw new IllegalArgumentException("Unsupported export target kind");
        }
    }

    private void validateProgramTarget(final AdvancedCapabilityDtos.ExportTarget target) {
        if (target.spriteName() != null || target.scriptId() != null) {
            throw new IllegalArgumentException("Program export target is contradictory");
        }
    }

    private void validateSpriteTarget(final AdvancedCapabilityDtos.ExportTarget target) {
        requireTargetValue(target.spriteName(), "Sprite export target is required");
        if (target.scriptId() != null) {
            throw new IllegalArgumentException("Sprite export target is contradictory");
        }
    }

    private void validateScriptTarget(final AdvancedCapabilityDtos.ExportTarget target) {
        requireTargetValue(target.scriptId(), "Script export target is required");
        if (target.spriteName() != null) {
            throw new IllegalArgumentException("Script export target is contradictory");
        }
    }

    private AdvancedCapabilityDtos.InjectionPreview boundedPreview(
        final AdvancedCapabilityDtos.InjectionPreview preview
    ) {
        if (preview.results().size() > configuration.getFaultInjection().getMaxMutationResults()) {
            throw CapabilityException.limitExceeded();
        }
        return preview;
    }

    private void requireTargetValue(final String value, final String message) {
        if (value == null || value.isBlank() || value.length() > 255) {
            throw new IllegalArgumentException(message);
        }
    }

    private void requireReference(final AdvancedCapabilityDtos.AnalysisReference reference) {
        if (!validReference(reference)) {
            throw new IllegalArgumentException("A valid analysis reference is required");
        }
    }

    private boolean validReference(final AdvancedCapabilityDtos.AnalysisReference reference) {
        if (reference == null || reference.analysisId() < 1 || reference.submissionToken() == null) {
            return false;
        }
        return !reference.submissionToken().isBlank() && reference.submissionToken().length() <= 128;
    }

    private void requireEnabled(final boolean enabled) {
        if (!enabled) {
            throw CapabilityException.disabled();
        }
    }

    private void requireMatchingBearer(final String submissionToken, final String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw CapabilityException.authorizationRequired();
        }
        final String bearer = authorization.substring(7).trim();
        if (bearer.isEmpty()) {
            throw CapabilityException.authorizationRequired();
        }
        if (
            !MessageDigest.isEqual(
                submissionToken.getBytes(StandardCharsets.UTF_8), bearer.getBytes(StandardCharsets.UTF_8)
            )
        ) {
            throw CapabilityException.analysisNotFound();
        }
    }

    private record DownloadType(String mediaType, String extension) {
    }
}
