/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import okio.Buffer;

class ScratchProjectClientTest {

    private static final String STUDIO_ID = "17";
    private static final String PROJECT_ID = "23";
    private static final String PROJECT_METADATA = "{\"project_token\":\"synthetic-token\"}";
    private static final String EMPTY_PROJECT = "{\"targets\":[]}";

    private MockWebServer server;
    private ScratchProjectClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = new MockWebServer();
        server.start();
        final String base = "http://localhost:" + server.getPort();
        client = new ScratchProjectClient(WebClient.builder(), base, base, base);
    }

    @AfterEach
    void stopServer() {
        server.close();
    }

    @Test
    void rejectsNonNumericCallerControlledIdentifiersWithoutNetworkAccess() {
        assertThatThrownBy(() -> client.downloadStudio("https://example.test/studios/1").block())
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("numeric");
        assertThatThrownBy(() -> client.download("../23").block())
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("numeric");
        assertThat(server.getRequestCount()).isZero();
    }

    @Test
    void paginatesStudioUntilExhaustionAndDownloadsExactProjectBundle() throws InterruptedException {
        enqueue("[{\"id\":23}]");
        enqueue("[]");
        enqueue(PROJECT_METADATA);
        enqueue(EMPTY_PROJECT);

        final var downloads = client.downloadStudio(STUDIO_ID).block(Duration.ofSeconds(5));

        assertThat(downloads).hasSize(1);
        assertThat(downloads.getFirst().id()).isEqualTo(PROJECT_ID);
        assertThat(downloads.getFirst().archive()).isNotEmpty();
        assertThat(server.takeRequest().getTarget()).isEqualTo("/studios/17/projects?limit=40&offset=0");
        assertThat(server.takeRequest().getTarget()).isEqualTo("/studios/17/projects?limit=40&offset=1");
        assertThat(server.takeRequest().getTarget()).isEqualTo("/projects/23");
        assertThat(server.takeRequest().getTarget()).isEqualTo("/23?token=synthetic-token");
    }

    @Test
    void retainsExactScratchMetadataProjectAndAssetsInAManifestedBundle() throws Exception {
        final byte[] asset = new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
        final String assetName = HexFormat.of().formatHex(
            MessageDigest.getInstance("MD5").digest(asset)
        ) + ".png";
        final byte[] project = ("{\"targets\":[{\"name\":\"Stage\",\"currentCostume\":0,"
            + "\"costumes\":[{\"md5ext\":\"" + assetName + "\"}],\"sounds\":[],\"blocks\":{}}]}")
            .getBytes(StandardCharsets.UTF_8);
        final byte[] metadata = "{\"project_token\":\"synthetic-token\",\"username\":\"verbatim-user\","
            .concat("\"created\":\"2020-01-02T03:04:05Z\",\"modified\":\"2021-02-03T04:05:06Z\"}")
            .getBytes(StandardCharsets.UTF_8);
        enqueue(new String(metadata, StandardCharsets.UTF_8));
        enqueue(new String(project, StandardCharsets.UTF_8));
        enqueue(asset);

        final byte[] bundle = client.download(PROJECT_ID).block(Duration.ofSeconds(5));
        final Map<String, byte[]> entries = unzip(bundle);

        assertThat(entries.get("project.json")).isEqualTo(project);
        assertThat(entries.get("litterbox/metadata.json")).isEqualTo(metadata);
        assertThat(new String(entries.get("litterbox/manifest.json"), StandardCharsets.UTF_8))
            .contains("\"projectId\":\"23\"")
            .contains("\"authorUsername\":\"verbatim-user\"")
            .contains("\"created\":\"2020-01-02T03:04:05Z\"")
            .contains("\"modified\":\"2021-02-03T04:05:06Z\"")
            .contains("\"fetchedAt\":\"");
        final var manifest = tools.jackson.databind.json.JsonMapper.shared().readTree(
            entries.get("litterbox/manifest.json")
        );
        assertThat(manifest.path("metadataSha256").textValue())
            .isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(metadata)));
        assertThat(manifest.path("projectJsonSha256").textValue())
            .isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(project)));
        assertThat(manifest.path("assets").get(0).path("sha256").textValue())
            .isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(asset)));
        assertThat(entries.get(assetName)).isEqualTo(asset);
    }

    @Test
    void recordsVerbatimUsernameStatisticsAndStableFetchTimeInManifest() throws Exception {
        final Instant fetchedAt = Instant.parse("2026-08-04T10:15:30Z");
        client = client(Duration.ofSeconds(2), Clock.fixed(fetchedAt, ZoneOffset.UTC));
        enqueue(
            "{\"project_token\":\"synthetic-token\",\"author\":{\"username\":\"Case_User\"},"
                + "\"stats\":{\"views\":12,\"loves\":3,\"favorites\":2,\"remixes\":1},"
                + "\"history\":{\"created\":\"2020-01-02T03:04:05Z\"}}"
        );
        enqueue(EMPTY_PROJECT);

        final var manifest = tools.jackson.databind.json.JsonMapper.shared().readTree(
            unzip(client.download(PROJECT_ID).block(Duration.ofSeconds(5))).get("litterbox/manifest.json")
        );

        assertThat(manifest.path("authorUsername").textValue()).isEqualTo("Case_User");
        assertThat(manifest.path("statistics").path("views").longValue()).isEqualTo(12);
        assertThat(manifest.path("statistics").path("remixes").longValue()).isEqualTo(1);
        assertThat(manifest.path("upstreamTimestamps").path("history.created").textValue())
            .isEqualTo("2020-01-02T03:04:05Z");
        assertThat(manifest.path("fetchedAt").textValue()).isEqualTo(fetchedAt.toString());
    }

    @Test
    void paginatesDeduplicatesInPresentationOrderAndStopsAtTheCeiling() {
        enqueue("[{\"id\":23},{\"id\":24}]");
        enqueue("[{\"id\":24},{\"id\":25}]");
        enqueue("[]");

        assertThat(client.listStudioProjectIds(STUDIO_ID).block(Duration.ofSeconds(5)))
            .containsExactly(PROJECT_ID, "24", "25");
        assertThat(server.getRequestCount()).isEqualTo(3);

        final List<String> projects = new ArrayList<>();
        for (int id = 1; id <= 10_001; id++) {
            projects.add("{\"id\":" + id + "}");
        }
        enqueue("[" + String.join(",", projects) + "]");

        final List<String> capped = client.listStudioProjectIds("18").block(Duration.ofSeconds(5));
        assertThat(capped).hasSize(10_000);
        assertThat(capped.getFirst()).isEqualTo("1");
        assertThat(capped.getLast()).isEqualTo("10000");
        assertThat(server.getRequestCount()).isEqualTo(4);
    }

    @Test
    void continuesPaginationBeyondThePreviousTwoThousandEntryBoundary() throws InterruptedException {
        client = client(Duration.ofSeconds(2), Clock.systemUTC());
        for (int page = 0; page < 51; page++) {
            final List<String> projects = new ArrayList<>();
            for (int item = 1; item <= 40; item++) {
                projects.add("{\"id\":" + (page * 40 + item) + "}");
            }
            enqueue("[" + String.join(",", projects) + "]");
        }
        enqueue("[]");

        assertThat(client.listStudioProjectIds(STUDIO_ID).block(Duration.ofSeconds(5))).hasSize(2_040);
        final List<String> targets = new ArrayList<>();
        for (int request = 0; request < 52; request++) {
            targets.add(server.takeRequest().getTarget());
        }
        assertThat(targets).contains("/studios/17/projects?limit=40&offset=2000");
        assertThat(targets.getLast()).isEqualTo("/studios/17/projects?limit=40&offset=2040");
    }

    @Test
    void settlesASmallStudioExactlyBecauseScratchKeepsCountingDeletedProjects() throws InterruptedException {
        enqueue("{\"title\":\"Klasse 8b\",\"visibility\":\"visible\",\"public\":true,\"stats\":{\"projects\":5}}");
        enqueue("[{\"id\":23},{\"id\":24},{\"id\":25},{\"id\":26}]");
        enqueue("[]");

        final var summary = client.studioSummary(STUDIO_ID).block(Duration.ofSeconds(5));

        assertThat(summary).isNotNull();
        assertThat(summary.title()).isEqualTo("Klasse 8b");
        assertThat(summary.readable()).isTrue();
        assertThat(summary.projects()).isEqualTo(4);
        assertThat(server.takeRequest().getTarget()).isEqualTo("/studios/17");
        assertThat(server.takeRequest().getTarget()).isEqualTo("/studios/17/projects?limit=40&offset=0");
    }

    /*
     * A studio's own statistics stop counting at one hundred, so a studio of 291 reports 100 and a studio of 1029
     * reports 100 as well. Believing that number told a teacher their 291-project studio held 100, and the run then
     * fetched all 291. The listing is the only thing that knows, and it is what is counted.
     */
    @Test
    void countsPastTheHundredAtWhichScratchStopsCountingForItself() throws InterruptedException {
        enqueue("{\"title\":\"Whole year\",\"visibility\":\"visible\",\"public\":true,\"stats\":{\"projects\":100}}");
        enqueueStudioListing(291);

        final var summary = client.studioSummary(STUDIO_ID).block(Duration.ofSeconds(10));

        assertThat(summary).isNotNull();
        assertThat(summary.projects()).isEqualTo(291);
        assertThat(server.takeRequest().getTarget()).isEqualTo("/studios/17");
        final List<String> targets = new ArrayList<>();
        for (int request = 1; request < server.getRequestCount(); request++) {
            targets.add(server.takeRequest().getTarget());
        }
        assertThat(targets.getFirst()).isEqualTo("/studios/17/projects?limit=40&offset=0");
        assertThat(targets.getLast()).isEqualTo("/studios/17/projects?limit=40&offset=291");
    }

    /*
     * Past the point where counting stops, the honest answer is that it was not counted. A walk that fills its
     * ceiling cannot tell a studio of exactly that size from a larger one.
     */
    @Test
    void leavesTheSizeUnknownForAStudioLargerThanItWillCount() {
        client = new ScratchProjectClient(
            WebClient.builder(), "http://localhost:" + server.getPort(), "http://localhost:" + server.getPort(),
            "http://localhost:" + server.getPort(), new SimpleMeterRegistry(), Duration.ofSeconds(5), Duration.ZERO,
            Clock.systemUTC(), 80
        );
        enqueue("{\"title\":\"Unnumbered\",\"visibility\":\"visible\",\"public\":true}");
        enqueueStudioListing(200);

        final var summary = client.studioSummary(STUDIO_ID).block(Duration.ofSeconds(10));

        assertThat(summary).isNotNull();
        assertThat(summary.readable()).isTrue();
        assertThat(summary.projects()).isNull();
        // Two pages and no more: the check never asks for projects the run itself would refuse to fetch.
        assertThat(server.getRequestCount()).isEqualTo(3);
    }

    @Test
    void reportsAHiddenStudioAsUnreadableWithoutAskingForItsProjects() {
        enqueue("{\"title\":\"Private\",\"visibility\":\"visible\",\"public\":false,\"stats\":{\"projects\":9}}");

        final var summary = client.studioSummary(STUDIO_ID).block(Duration.ofSeconds(5));

        assertThat(summary).isNotNull();
        assertThat(summary.readable()).isFalse();
        assertThat(summary.projects()).isNull();
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void rejectsANonNumericStudioSummaryWithoutNetworkAccess() {
        assertThatThrownBy(() -> client.studioSummary("../17").block())
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("numeric");
        assertThat(server.getRequestCount()).isZero();
    }

    @Test
    void observesCancellationBetweenStudioPages() {
        enqueue("[{\"id\":23}]");
        final AtomicInteger checks = new AtomicInteger();

        assertThatThrownBy(
            () -> client.listStudioProjectIds(
                STUDIO_ID, () -> reactor.core.publisher.Mono.just(checks.incrementAndGet() > 1)
            ).block(Duration.ofSeconds(5))
        ).isInstanceOf(CancellationException.class);
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void keepsFetchingAfterAnIndependentProjectFailure() {
        enqueue("[{\"id\":23},{\"id\":24}]");
        enqueue("[]");
        enqueue(404);
        enqueue(PROJECT_METADATA);
        enqueue(EMPTY_PROJECT);

        final var downloads = client.downloadStudio(STUDIO_ID).block(Duration.ofSeconds(5));

        assertThat(downloads).hasSize(2);
        assertThat(downloads.getFirst().failureType()).isNotBlank();
        assertThat(downloads.getFirst().archive()).isNull();
        assertThat(downloads.getLast().failureType()).isNull();
        assertThat(downloads.getLast().archive()).isNotEmpty();
    }

    @Test
    void rejectsNonScratchConfiguredEndpointHosts() {
        assertThatThrownBy(
            () -> new ScratchProjectClient(
                WebClient.builder(), "https://example.test", "https://projects.scratch.mit.edu",
                "https://assets.scratch.mit.edu"
            )
        ).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("host");
    }

    @Test
    void retriesServerErrorsButNotClientErrors() {
        enqueue(500);
        enqueue(PROJECT_METADATA);
        enqueue(EMPTY_PROJECT);

        assertThat(client.download(PROJECT_ID).block(Duration.ofSeconds(5))).isNotEmpty();
        assertThat(server.getRequestCount()).isEqualTo(3);

        enqueue(404);
        assertThatThrownBy(() -> client.download("24").block(Duration.ofSeconds(5)))
            .isInstanceOf(WebClientResponseException.NotFound.class);
        assertThat(server.getRequestCount()).isEqualTo(4);

        enqueue(429);
        enqueue(PROJECT_METADATA);
        enqueue(EMPTY_PROJECT);
        assertThat(client.download("25").block(Duration.ofSeconds(5))).isNotEmpty();
        assertThat(server.getRequestCount()).isEqualTo(7);
    }

    @Test
    void appliesABoundedTimeoutAndRetriesItAsTransient() {
        // The timeout has to outlast opening a connection and writing the request, or an attempt is abandoned before
        // the server ever sees it and goes uncounted; it has to fall well short of the delay below, or nothing times
        // out at all. Both margins are wide because the room between them is what a loaded runner spends.
        client = client(Duration.ofMillis(300), Clock.systemUTC());
        for (int attempt = 0; attempt < 4; attempt++) {
            server.enqueue(
                new MockResponse.Builder().code(200).headersDelay(3, TimeUnit.SECONDS)
                    .body("{\"project_token\":\"late\"}").build()
            );
        }

        // Four attempts of up to 300ms, and three backoffs of up to 200, 400 and 800ms with half of each as jitter.
        assertThatThrownBy(() -> client.download(PROJECT_ID).block(Duration.ofSeconds(20)))
            .hasRootCauseInstanceOf(TimeoutException.class);
        assertThat(server.getRequestCount()).isEqualTo(4);
    }

    @Test
    void rejectsResponsesBeyondTheBoundedInMemoryLimit() {
        client = client(Duration.ofSeconds(2), Clock.systemUTC());
        enqueue(new byte[10 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> client.download(PROJECT_ID).block(Duration.ofSeconds(5)))
            .hasMessageContaining("Exceeded limit");
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void rejectsScratchAssetsWhoseContentDoesNotMatchTheIdentifier() throws Exception {
        final byte[] expected = "expected".getBytes(StandardCharsets.UTF_8);
        final String assetName = HexFormat.of().formatHex(
            MessageDigest.getInstance("MD5").digest(expected)
        ) + ".png";
        enqueue(PROJECT_METADATA);
        enqueue(
            "{\"targets\":[{\"costumes\":[{\"md5ext\":\"" + assetName
                + "\"}],\"sounds\":[]}]}"
        );
        enqueue("different".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> client.download(PROJECT_ID).block(Duration.ofSeconds(5)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("digest");
    }

    /** A studio of {@code total} projects as its listing serves it: full pages, then whatever is left, then none. */
    private void enqueueStudioListing(final int total) {
        for (int offset = 0; offset < total; offset += 40) {
            final List<String> page = new ArrayList<>();
            for (int item = offset + 1; item <= Math.min(offset + 40, total); item++) {
                page.add("{\"id\":" + item + "}");
            }
            enqueue("[" + String.join(",", page) + "]");
        }
        enqueue("[]");
    }

    private void enqueue(final String json) {
        server.enqueue(
            new MockResponse.Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(json)
                .build()
        );
    }

    private void enqueue(final byte[] body) {
        server.enqueue(
            new MockResponse.Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(new Buffer().write(body))
                .build()
        );
    }

    private void enqueue(final int status) {
        server.enqueue(new MockResponse.Builder().code(status).build());
    }

    private ScratchProjectClient client(final Duration timeout, final Clock clock) {
        final String base = "http://localhost:" + server.getPort();
        return new ScratchProjectClient(
            WebClient.builder(), base, base, base, new SimpleMeterRegistry(), timeout, Duration.ZERO, clock
        );
    }

    private Map<String, byte[]> unzip(final byte[] archive) throws IOException {
        final Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(archive))) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        return entries;
    }
}
