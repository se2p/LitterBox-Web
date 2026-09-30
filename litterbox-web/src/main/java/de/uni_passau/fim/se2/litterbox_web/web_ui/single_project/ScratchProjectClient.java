/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ScratchProjectClient {

    private static final int MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_ASSETS = 2_000;
    private static final long MAX_BUNDLE_BYTES = 100L * 1024 * 1024;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration REQUEST_INTERVAL = Duration.ofMillis(25);
    private static final int MAX_RETRIES = 3;
    private static final int MAX_STUDIO_PROJECTS = 10_000;
    private static final int STUDIO_PAGE_SIZE = 40;
    private static final int MAX_STUDIO_TITLE_LENGTH = 200;
    /*
     * How far the size of a studio is established before it is submitted. Counting happens while a teacher is still
     * typing an id, so it stops here rather than walking the whole studio; past this, the form reports "more than can
     * be counted first". Two thousand is well beyond any studio a class or competition produces.
     */
    private static final int MAX_PRECHECK_PROJECTS = 2_000;

    private final WebClient client;
    private final String apiBase;
    private final String projectsBase;
    private final String assetsBase;
    private final MeterRegistry metrics;
    private final Duration requestTimeout;
    private final Duration requestInterval;
    private final Clock clock;
    private final int studioProjectCeiling;
    private final AtomicLong nextRequestNanos = new AtomicLong();
    private final JsonMapper mapper = JsonMapper.shared();

    @Autowired
    public ScratchProjectClient(
        final WebClient.Builder builder,
        @Value("${litterbox.scratch.api-base:https://api.scratch.mit.edu}") final String apiBase,
        @Value("${litterbox.scratch.projects-base:https://projects.scratch.mit.edu}") final String projectsBase,
        @Value("${litterbox.scratch.assets-base:https://assets.scratch.mit.edu}") final String assetsBase,
        final MeterRegistry metrics,
        @Value("${litterbox.scratch.studio-project-ceiling:10000}") final int studioProjectCeiling
    ) {
        this(
            builder, apiBase, projectsBase, assetsBase, metrics, REQUEST_TIMEOUT, REQUEST_INTERVAL,
            Clock.systemUTC(), studioProjectCeiling
        );
    }

    ScratchProjectClient(
        final WebClient.Builder builder,
        final String apiBase,
        final String projectsBase,
        final String assetsBase
    ) {
        this(
            builder, apiBase, projectsBase, assetsBase, Metrics.globalRegistry, REQUEST_TIMEOUT,
            REQUEST_INTERVAL, Clock.systemUTC(), MAX_STUDIO_PROJECTS
        );
    }

    ScratchProjectClient(
        final WebClient.Builder builder,
        final String apiBase,
        final String projectsBase,
        final String assetsBase,
        final MeterRegistry metrics,
        final Duration requestTimeout,
        final Duration requestInterval,
        final Clock clock
    ) {
        this(
            builder, apiBase, projectsBase, assetsBase, metrics, requestTimeout, requestInterval, clock,
            MAX_STUDIO_PROJECTS
        );
    }

    ScratchProjectClient(
        final WebClient.Builder builder,
        final String apiBase,
        final String projectsBase,
        final String assetsBase,
        final MeterRegistry metrics,
        final Duration requestTimeout,
        final Duration requestInterval,
        final Clock clock,
        final int studioProjectCeiling
    ) {
        this.client = builder.codecs(
            codecs -> codecs.defaultCodecs().maxInMemorySize(MAX_RESPONSE_BYTES)
        ).build();
        this.apiBase = fixedBase(apiBase, "api.scratch.mit.edu");
        this.projectsBase = fixedBase(projectsBase, "projects.scratch.mit.edu");
        this.assetsBase = fixedBase(assetsBase, "assets.scratch.mit.edu");
        this.metrics = java.util.Objects.requireNonNull(metrics, "metrics");
        this.requestTimeout = positive(requestTimeout, "requestTimeout");
        this.requestInterval = nonNegative(requestInterval, "requestInterval");
        this.clock = java.util.Objects.requireNonNull(clock, "clock");
        if (studioProjectCeiling < 1 || studioProjectCeiling > MAX_STUDIO_PROJECTS) {
            throw new IllegalArgumentException("studioProjectCeiling is outside the safety limit");
        }
        this.studioProjectCeiling = studioProjectCeiling;
    }

    public Mono<byte[]> download(final String projectId) {
        if (projectId == null || !projectId.matches("[1-9][0-9]{0,17}")) {
            return Mono.error(new IllegalArgumentException("Scratch project id must be numeric"));
        }
        final String metadataUrl = apiBase + "/projects/{projectId}";
        return get(Endpoint.METADATA, metadataUrl, projectId)
            .flatMap(metadata -> project(metadata, projectId));
    }

    /**
     * What a studio says about itself, before a single project has been fetched out of it. Sending a studio starts a
     * run that cannot be taken back, so the size of it is worth knowing while there is still a form on the screen.
     *
     * @param projects the number of projects the studio holds, or {@code null} when the studio is unreadable or too
     *                 large to settle cheaply
     */
    public record StudioSummary(String studioId, String title, boolean readable, Integer projects) {
    }

    public Mono<StudioSummary> studioSummary(final String studioId) {
        if (studioId == null || !studioId.matches("[1-9][0-9]{0,17}")) {
            return Mono.error(new IllegalArgumentException("Scratch studio id must be numeric"));
        }
        return get(Endpoint.STUDIO, apiBase + "/studios/{studioId}", studioId)
            .flatMap(bytes -> studioSummary(studioId, bytes));
    }

    private Mono<StudioSummary> studioSummary(final String studioId, final byte[] bytes) {
        final JsonNode root = mapper.readTree(bytes);
        if (root == null || !root.isObject()) {
            return Mono.error(new IllegalArgumentException("Scratch studio response is not an object"));
        }
        final String title = studioTitle(root);
        if (!readableStudio(root)) {
            return Mono.just(new StudioSummary(studioId, title, false, null));
        }
        // Counted by the same walk the run itself makes, so the number shown here is the number that gets analysed.
        return studioProjectIds(studioId, 0, new LinkedHashSet<>(), () -> Mono.just(false), precheckCeiling())
            .map(ids -> new StudioSummary(studioId, title, true, countedProjects(ids.size())));
    }

    /** Never past what a run would fetch: naming a size the analysis would not honour helps nobody. */
    private int precheckCeiling() {
        return Math.min(MAX_PRECHECK_PROJECTS, studioProjectCeiling);
    }

    /**
     * The size of the studio, or {@code null} where counting stopped before the end of it: a walk that fills its
     * ceiling cannot tell a studio of exactly that size from a larger one.
     */
    private Integer countedProjects(final int counted) {
        return counted >= precheckCeiling() ? null : counted;
    }

    private String studioTitle(final JsonNode root) {
        final JsonNode title = root.get("title");
        if (title == null || !title.isTextual()) {
            return null;
        }
        final String value = title.textValue().strip();
        if (value.isEmpty()) {
            return null;
        }
        return value.length() > MAX_STUDIO_TITLE_LENGTH ? value.substring(0, MAX_STUDIO_TITLE_LENGTH) : value;
    }

    /** A studio that Scratch hides is one the service cannot list either, whatever its stated size. */
    private boolean readableStudio(final JsonNode root) {
        final JsonNode visibility = root.get("visibility");
        if (visibility != null && visibility.isTextual() && !"visible".equalsIgnoreCase(visibility.textValue())) {
            return false;
        }
        final JsonNode published = root.get("public");
        return published == null || !published.isBoolean() || published.booleanValue();
    }

    public Mono<List<ProjectDownload>> downloadStudio(final String studioId) {
        return listStudioProjectIds(studioId).flatMap(ids -> downloadStudioProjects(ids).collectList());
    }

    public Mono<List<String>> listStudioProjectIds(final String studioId) {
        return listStudioProjectIds(studioId, () -> Mono.just(false));
    }

    Mono<List<String>> listStudioProjectIds(
        final String studioId,
        final Supplier<Mono<Boolean>> cancellationRequested
    ) {
        if (studioId == null || !studioId.matches("[1-9][0-9]{0,17}")) {
            return Mono.error(new IllegalArgumentException("Scratch studio id must be numeric"));
        }
        java.util.Objects.requireNonNull(cancellationRequested, "cancellationRequested");
        return studioProjectIds(studioId, 0, new LinkedHashSet<>(), cancellationRequested, studioProjectCeiling);
    }

    public Flux<ProjectDownload> downloadStudioProjects(final List<String> projectIds) {
        return Flux.fromIterable(List.copyOf(projectIds)).concatMap(this::downloadStudioProject);
    }

    private Mono<ProjectDownload> downloadStudioProject(final String id) {
        return download(id)
            .map(bytes -> new ProjectDownload(id, bytes, null, null))
            .onErrorResume(error -> projectDownloadFailure(id, error));
    }

    private Mono<ProjectDownload> projectDownloadFailure(final String id, final Throwable error) {
        if (error instanceof CancellationException) {
            return Mono.error(error);
        }
        return Mono.just(
            new ProjectDownload(id, null, error.getClass().getSimpleName(), "Scratch project could not be fetched")
        );
    }

    /**
     * One walk of a studio's listing, shared by the run that downloads it and the check that sizes it beforehand: two
     * walks with two stopping rules would be two answers.
     *
     * @param ceiling how many projects this walk will take before it stops, whatever the studio holds
     */
    private Mono<List<String>> studioProjectIds(
        final String studioId,
        final int offset,
        final LinkedHashSet<String> collected,
        final Supplier<Mono<Boolean>> cancellationRequested,
        final int ceiling
    ) {
        if (offset >= ceiling) {
            return Mono.just(List.copyOf(collected));
        }
        return cancellationRequested.get()
            .flatMap(
                cancelled -> cancelled
                    ? Mono.error(new CancellationException("Scratch studio ingestion was cancelled"))
                    : get(
                        Endpoint.STUDIO,
                        apiBase + "/studios/{studioId}/projects?limit={limit}&offset={offset}", studioId,
                        STUDIO_PAGE_SIZE, offset
                    )
            )
            .flatMap(bytes -> readStudioPage(studioId, offset, collected, cancellationRequested, ceiling, bytes));
    }

    private Mono<List<String>> readStudioPage(
        final String studioId,
        final int offset,
        final LinkedHashSet<String> collected,
        final Supplier<Mono<Boolean>> cancellationRequested,
        final int ceiling,
        final byte[] bytes
    ) {
        final JsonNode projects = mapper.readTree(bytes);
        if (!projects.isArray()) {
            return Mono.error(new IllegalArgumentException("Scratch studio response is not an array"));
        }
        final int remaining = ceiling - offset;
        final int accepted = Math.min(projects.size(), remaining);
        for (int index = 0; index < accepted; index++) {
            final JsonNode project = projects.get(index);
            final JsonNode id = project.get("id");
            if (id == null || !id.asString().matches("[1-9][0-9]{0,17}")) {
                return Mono.error(new IllegalArgumentException("Scratch studio contains an invalid project id"));
            }
            collected.add(id.asString());
        }
        final int nextOffset = offset + accepted;
        if (projects.isEmpty() || nextOffset >= ceiling) {
            return Mono.just(List.copyOf(collected));
        }
        return cancellationRequested.get().flatMap(
            cancelled -> cancelled
                ? Mono.error(new CancellationException("Scratch studio ingestion was cancelled"))
                : studioProjectIds(studioId, nextOffset, collected, cancellationRequested, ceiling)
        );
    }

    private Mono<byte[]> project(final byte[] metadata, final String projectId) {
        final JsonNode metadataRoot = mapper.readTree(metadata);
        final String token = accessToken(metadataRoot, projectId);
        return get(Endpoint.PROJECT, projectsBase + "/{projectId}?token={token}", projectId, token)
            .flatMap(projectJson -> bundle(projectId, metadata, metadataRoot, projectJson));
    }

    private Mono<byte[]> bundle(
        final String projectId, final byte[] metadata, final JsonNode metadataRoot, final byte[] projectJson
    ) {
        if (projectJson.length > MAX_RESPONSE_BYTES) {
            return Mono.error(new IllegalArgumentException("Scratch project response exceeds the response limit"));
        }
        final List<String> assetNames = assetNames(projectJson);
        if (assetNames.size() > MAX_ASSETS) {
            return Mono.error(new IllegalArgumentException("Scratch project contains too many assets"));
        }
        final long initialSize = (long) metadata.length + projectJson.length;
        if (initialSize > MAX_BUNDLE_BYTES) {
            return Mono.error(new IllegalArgumentException("Scratch project bundle exceeds the extraction limit"));
        }
        final AtomicLong totalSize = new AtomicLong(initialSize);
        return Flux.fromIterable(assetNames)
            .concatMap(this::downloadAsset)
            .<DownloadedAsset>handle((asset, sink) -> {
                if (totalSize.addAndGet(asset.content().length) > MAX_BUNDLE_BYTES) {
                    sink.error(new IllegalArgumentException("Scratch project bundle exceeds the extraction limit"));
                }
                else {
                    sink.next(asset);
                }
            })
            .collectList()
            .map(assets -> createBundle(projectId, metadata, metadataRoot, projectJson, assets));
    }

    private Mono<DownloadedAsset> downloadAsset(final String name) {
        return get(Endpoint.ASSET, assetsBase + "/internalapi/asset/{name}/get/", name)
            .map(content -> {
                final String expected = name.substring(0, 32);
                final String actual = java.util.HexFormat.of().formatHex(SingleProjectSupport.digest("MD5", content));
                if (!expected.equalsIgnoreCase(actual)) {
                    throw new IllegalArgumentException("Scratch asset digest does not match its identifier");
                }
                return new DownloadedAsset(name, content, SingleProjectSupport.digest("SHA-256", content));
            });
    }

    private List<String> assetNames(final byte[] projectJson) {
        final JsonNode root = mapper.readTree(projectJson);
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("Scratch project response is not an object");
        }
        final Set<String> result = new LinkedHashSet<>();
        collectAssets(root.get("targets"), result);
        return result.stream().sorted().toList();
    }

    private void collectAssets(final JsonNode targets, final Set<String> result) {
        if (targets == null || !targets.isArray()) {
            throw new IllegalArgumentException("Scratch project does not contain targets");
        }
        for (JsonNode target : targets) {
            if (target == null || !target.isObject()) {
                throw new IllegalArgumentException("Scratch project contains an invalid target");
            }
            collectAssetArray(target.get("costumes"), result);
            collectAssetArray(target.get("sounds"), result);
        }
    }

    private void collectAssetArray(final JsonNode nodes, final Set<String> result) {
        if (nodes == null || !nodes.isArray()) {
            return;
        }
        for (JsonNode node : nodes) {
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("Scratch project contains an invalid asset entry");
            }
            final JsonNode md5extNode = node.get("md5ext");
            if (md5extNode == null) {
                continue;
            }
            if (!md5extNode.isTextual()) {
                throw new IllegalArgumentException("Scratch project contains an invalid asset identifier");
            }
            final String name = md5extNode.asString();
            if (!name.matches("[0-9a-fA-F]{32}\\.[A-Za-z0-9]{1,10}")) {
                throw new IllegalArgumentException("Scratch project contains an invalid asset identifier");
            }
            result.add(name);
        }
    }

    private byte[] createBundle(
        final String projectId,
        final byte[] metadata,
        final JsonNode metadataRoot,
        final byte[] projectJson,
        final List<DownloadedAsset> assets
    ) {
        try {
            final byte[] manifest = manifest(projectId, metadata, metadataRoot, projectJson, assets);
            final long uncompressedSize = (long) projectJson.length + metadata.length + manifest.length
                + assets.stream().mapToLong(asset -> asset.content().length).sum();
            if (uncompressedSize > MAX_BUNDLE_BYTES) {
                throw new IllegalArgumentException("Scratch project bundle exceeds the storage limit");
            }
            final ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output)) {
                putEntry(zip, "project.json", projectJson);
                putEntry(zip, "litterbox/metadata.json", metadata);
                putEntry(zip, "litterbox/manifest.json", manifest);
                for (
                    DownloadedAsset asset : assets.stream().sorted(Comparator.comparing(DownloadedAsset::name)).toList()
                ) {
                    putEntry(zip, asset.name(), asset.content());
                }
            }
            if (output.size() > MAX_BUNDLE_BYTES) {
                throw new IllegalArgumentException("Scratch project bundle exceeds the storage limit");
            }
            return output.toByteArray();
        }
        catch (IOException error) {
            throw new IllegalStateException("Unable to create Scratch project bundle", error);
        }
    }

    private void putEntry(final ZipOutputStream zip, final String name, final byte[] content) throws IOException {
        final ZipEntry entry = new ZipEntry(name);
        entry.setTime(0);
        zip.putNextEntry(entry);
        zip.write(content);
        zip.closeEntry();
    }

    private byte[] manifest(
        final String projectId,
        final byte[] metadata,
        final JsonNode metadataRoot,
        final byte[] projectJson,
        final List<DownloadedAsset> assets
    ) {
        final Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", "scratch-project-bundle");
        manifest.put("version", 2);
        manifest.put("projectId", projectId);
        manifest.put("fetchedAt", clock.instant().toString());
        manifest.put("authorUsername", authorUsername(metadataRoot));
        manifest.put("upstreamTimestamps", timestamps(metadataRoot));
        manifest.put("statistics", statistics(metadataRoot));
        manifest.put("metadataSha256", HexFormat.of().formatHex(SingleProjectSupport.digest("SHA-256", metadata)));
        manifest.put(
            "projectJsonSha256", HexFormat.of().formatHex(SingleProjectSupport.digest("SHA-256", projectJson))
        );
        manifest.put(
            "assets", assets.stream().sorted(Comparator.comparing(DownloadedAsset::name))
                .map(this::assetManifest).toList()
        );
        return mapper.writeValueAsString(manifest).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private Map<String, Object> assetManifest(final DownloadedAsset asset) {
        final Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("name", asset.name());
        manifest.put("scratchMd5", asset.name().substring(0, 32).toLowerCase(java.util.Locale.ROOT));
        manifest.put("sha256", HexFormat.of().formatHex(asset.sha256()));
        manifest.put("byteSize", asset.content().length);
        return manifest;
    }

    private String authorUsername(final JsonNode metadata) {
        final JsonNode username = metadata.get("username");
        if (username != null && username.isTextual()) {
            return validatedUsername(username.textValue());
        }
        final JsonNode author = metadata.get("author");
        if (author != null && author.isObject()) {
            final JsonNode authorUsername = author.get("username");
            if (authorUsername != null && authorUsername.isTextual()) {
                return validatedUsername(authorUsername.textValue());
            }
        }
        return null;
    }

    private String validatedUsername(final String username) {
        if (username.length() > 255) {
            throw new IllegalArgumentException("Scratch author username exceeds the storage limit");
        }
        return username;
    }

    private Map<String, Long> statistics(final JsonNode metadata) {
        final JsonNode source = metadata.get("stats");
        if (source == null || source.isNull()) {
            return Map.of();
        }
        if (!source.isObject()) {
            throw new IllegalArgumentException("Scratch statistics are invalid");
        }
        final Map<String, Long> statistics = new LinkedHashMap<>();
        for (String name : List.of("views", "loves", "favorites", "remixes")) {
            final JsonNode value = source.get(name);
            if (value == null || value.isNull()) {
                continue;
            }
            if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) {
                throw new IllegalArgumentException("Scratch statistics are invalid");
            }
            statistics.put(name, value.longValue());
        }
        return statistics;
    }

    private Map<String, String> timestamps(final JsonNode metadata) {
        final Map<String, String> timestamps = new LinkedHashMap<>();
        for (
            String name : List.of(
                "created", "modified", "created_at", "updated_at", "createdAt", "updatedAt",
                "date_created", "date_modified"
            )
        ) {
            final JsonNode value = metadata.get(name);
            addTimestamp(timestamps, name, value);
        }
        final JsonNode history = metadata.get("history");
        if (history != null && history.isObject()) {
            for (String name : List.of("created", "modified")) {
                final JsonNode value = history.get(name);
                addTimestamp(timestamps, "history." + name, value);
            }
        }
        return timestamps;
    }

    private static void addTimestamp(final Map<String, String> timestamps, final String name, final JsonNode value) {
        if (value != null && !value.isNull()) {
            timestamps.put(name, value.isTextual() ? value.textValue() : value.toString());
        }
    }

    private String accessToken(final JsonNode root, final String projectId) {
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("Scratch metadata for " + projectId + " is not an object");
        }
        final JsonNode token = root.get("project_token");
        if (token == null || !token.isTextual() || token.textValue().isBlank() || token.textValue().length() > 512) {
            throw new IllegalArgumentException("Scratch metadata for " + projectId + " has no project token");
        }
        return token.textValue();
    }

    private Mono<byte[]> get(final Endpoint endpoint, final String template, final Object... variables) {
        return Mono.defer(
            () -> awaitRateLimit().then(
                client.get()
                    .uri(template, variables)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .timeout(requestTimeout)
            )
        )
            .map(bytes -> {
                if (bytes.length > MAX_RESPONSE_BYTES) {
                    throw new IllegalArgumentException("Scratch response exceeds the response limit");
                }
                return bytes;
            })
            .doOnSuccess(ignored -> recordRequest(endpoint, "success"))
            .doOnError(error -> recordRequest(endpoint, metricOutcome(error)))
            .retryWhen(Retry.backoff(MAX_RETRIES, Duration.ofMillis(200)).jitter(0.5).filter(this::retryable));
    }

    private Mono<Void> awaitRateLimit() {
        return Mono.defer(this::reserveRateLimit);
    }

    private Mono<Void> reserveRateLimit() {
        final long now = System.nanoTime();
        final long interval = requestInterval.toNanos();
        long current;
        long reserved;
        do {
            current = nextRequestNanos.get();
            reserved = Math.max(now, current);
        }
        while (!nextRequestNanos.compareAndSet(current, reserved + interval));
        final long delay = reserved - now;
        return delay <= 0 ? Mono.empty() : Mono.delay(Duration.ofNanos(delay)).then();
    }

    private void recordRequest(final Endpoint endpoint, final String outcome) {
        metrics.counter(
            "litterbox.scratch.requests", "endpoint", endpoint.metricTag(), "outcome", outcome
        ).increment();
    }

    private String metricOutcome(final Throwable error) {
        if (error instanceof java.util.concurrent.TimeoutException) {
            return "timeout";
        }
        if (error instanceof WebClientResponseException response) {
            if (response.getStatusCode().value() == 429) {
                return "rate_limited";
            }
            return response.getStatusCode().is5xxServerError() ? "server_error" : "client_error";
        }
        if (error instanceof WebClientRequestException) {
            return "transport_error";
        }
        return "invalid_response";
    }

    private boolean retryable(final Throwable error) {
        if (error instanceof java.util.concurrent.TimeoutException || error instanceof WebClientRequestException) {
            return true;
        }
        return error instanceof WebClientResponseException response && retryableResponse(response);
    }

    private boolean retryableResponse(final WebClientResponseException response) {
        if (response.getStatusCode().is5xxServerError()) {
            return true;
        }
        return response.getStatusCode().value() == HttpStatus.TOO_MANY_REQUESTS.value()
            || response.getStatusCode().value() == HttpStatus.REQUEST_TIMEOUT.value();
    }

    private String fixedBase(final String value, final String requiredHost) {
        final URI uri;
        try {
            uri = URI.create(value);
        }
        catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Scratch endpoint is not a valid URI", error);
        }
        if (!validEndpoint(uri, requiredHost)) {
            throw new IllegalArgumentException("Scratch endpoint host is not allowed");
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private boolean validEndpoint(final URI uri, final String requiredHost) {
        final String host = uri.getHost();
        if (!validHost(uri, requiredHost, host)) {
            return false;
        }
        if (!validUriOptions(uri)) {
            return false;
        }
        if (!validPath(uri)) {
            return false;
        }
        return validPort(uri, localHost(host));
    }

    private boolean validHost(final URI uri, final String requiredHost, final String host) {
        if (host == null || !validScheme(uri, host)) {
            return false;
        }
        return requiredHost.equalsIgnoreCase(host) || localHost(host);
    }

    private boolean validUriOptions(final URI uri) {
        return uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
    }

    private boolean validPort(final URI uri, final boolean local) {
        return local || uri.getPort() == -1 || uri.getPort() == 443;
    }

    private boolean validScheme(final URI uri, final String host) {
        if ("https".equalsIgnoreCase(uri.getScheme())) {
            return true;
        }
        return "http".equalsIgnoreCase(uri.getScheme()) && localHost(host);
    }

    private boolean validPath(final URI uri) {
        final String path = uri.getPath();
        return path == null || path.isEmpty() || "/".equals(path);
    }

    private boolean localHost(final String host) {
        return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host);
    }

    private Duration positive(final Duration duration, final String name) {
        java.util.Objects.requireNonNull(duration, name);
        if (duration.isZero() || duration.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
        return duration;
    }

    private Duration nonNegative(final Duration duration, final String name) {
        java.util.Objects.requireNonNull(duration, name);
        if (duration.isNegative()) {
            throw new IllegalArgumentException(name + " must not be negative");
        }
        return duration;
    }

    private enum Endpoint {

        STUDIO("studio"),
        METADATA("metadata"),
        PROJECT("project"),
        ASSET("asset");

        private final String metricTag;

        Endpoint(final String metricTag) {
            this.metricTag = metricTag;
        }

        private String metricTag() {
            return metricTag;
        }
    }

    private record DownloadedAsset(String name, byte[] content, byte[] sha256) {

        private DownloadedAsset {
            content = content.clone();
            sha256 = sha256.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }
    }

    public record ProjectDownload(String id, byte[] archive, String failureType, String failureMessage) {

        public ProjectDownload {
            if ((archive == null) == (failureType == null)) {
                throw new IllegalArgumentException("Project download must contain either an archive or a failure");
            }
            if (archive != null) {
                archive = archive.clone();
            }
        }

        @Override
        public byte[] archive() {
            return archive == null ? null : archive.clone();
        }
    }
}
