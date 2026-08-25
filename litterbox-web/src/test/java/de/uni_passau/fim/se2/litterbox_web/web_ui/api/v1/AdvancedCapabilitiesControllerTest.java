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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;

import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.FaultInjectionCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.GraphCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.ProgramExportCapability;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.SemanticDiffCapability;
import reactor.core.publisher.Mono;

class AdvancedCapabilitiesControllerTest {

    private static final String TOKEN = "synthetic-share-token";
    private static final String AUTHORIZATION = "Bearer " + TOKEN;
    private static final String CAPABILITY_DISABLED = "capability_disabled";
    private static final String CAPABILITY_UNAVAILABLE = "capability_unavailable";
    private static final String SYNTHETIC_INJECTOR = "synthetic-injector";
    private static final String ENGLISH = "en";
    private static final String NO_STORE = "no-store";
    private static final String CONTENT_TYPE_OPTIONS = "X-Content-Type-Options";
    private static final String NOSNIFF = "nosniff";

    @Test
    void failsClosedBeforeResolvingAnImplementation() {
        final AdvancedCapabilitiesController controller = controller(
            new AdvancedCapabilitiesConfiguration(), null, null, null, null
        );

        assertThatThrownBy(() -> controller.graph(TOKEN, 1, "ast", AUTHORIZATION))
            .isInstanceOfSatisfying(
                CapabilityException.class,
                error -> assertThat(error.code()).isEqualTo(CAPABILITY_DISABLED)
            );
    }

    @Test
    void everyAdvancedEndpointFailsClosedWhenItsOwnFlagIsDisabled() {
        final AdvancedCapabilitiesController controller = controller(
            new AdvancedCapabilitiesConfiguration(), null, null, null, null
        );
        final AdvancedCapabilityDtos.DiffRequest diffRequest = new AdvancedCapabilityDtos.DiffRequest(
            new AdvancedCapabilityDtos.AnalysisReference("before", 1),
            new AdvancedCapabilityDtos.AnalysisReference("after", 2)
        );
        final AdvancedCapabilityDtos.ExportRequest exportRequest = new AdvancedCapabilityDtos.ExportRequest(
            "scratchblocks", new AdvancedCapabilityDtos.ExportTarget("program", null, null)
        );
        final AdvancedCapabilityDtos.InjectionRequest injectionRequest = new AdvancedCapabilityDtos.InjectionRequest(
            List.of(SYNTHETIC_INJECTOR)
        );
        final AdvancedCapabilityDtos.InjectionDownloadRequest downloadRequest = new AdvancedCapabilityDtos.InjectionDownloadRequest(
            SYNTHETIC_INJECTOR, 0
        );

        assertCode(CAPABILITY_DISABLED, () -> controller.graph(TOKEN, 1, "ast", AUTHORIZATION).block());
        assertCode(CAPABILITY_DISABLED, () -> controller.diff(diffRequest).block());
        assertCode(
            CAPABILITY_DISABLED, () -> controller.export(TOKEN, 1, AUTHORIZATION, exportRequest).block()
        );
        assertCode(
            CAPABILITY_DISABLED, () -> controller.exportTargets(TOKEN, 1, AUTHORIZATION).block()
        );
        assertCode(
            CAPABILITY_DISABLED, () -> controller.injectors(TOKEN, 1, AUTHORIZATION, ENGLISH).block()
        );
        assertCode(
            CAPABILITY_DISABLED, () -> controller.injectorCatalogue(TOKEN, 1, AUTHORIZATION, ENGLISH).block()
        );
        assertCode(
            CAPABILITY_DISABLED, () -> controller.previewInjection(
                TOKEN, 1, AUTHORIZATION, injectionRequest
            ).block()
        );
        assertCode(
            CAPABILITY_DISABLED, () -> controller.downloadInjection(
                TOKEN, 1, AUTHORIZATION, downloadRequest
            ).block()
        );
    }

    @Test
    void enabledEndpointsRemainBoundedWhenTheirImplementationIsUnavailable() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getMetricsGraphs().setEnabled(true);
        configuration.getSemanticDiff().setEnabled(true);
        configuration.getProgramExport().setEnabled(true);
        configuration.getFaultInjection().setEnabled(true);
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, null, null);
        final AdvancedCapabilityDtos.DiffRequest diffRequest = new AdvancedCapabilityDtos.DiffRequest(
            new AdvancedCapabilityDtos.AnalysisReference("before", 1),
            new AdvancedCapabilityDtos.AnalysisReference("after", 2)
        );
        final AdvancedCapabilityDtos.ExportRequest exportRequest = new AdvancedCapabilityDtos.ExportRequest(
            "scratchblocks", new AdvancedCapabilityDtos.ExportTarget("program", null, null)
        );
        final AdvancedCapabilityDtos.InjectionRequest injectionRequest = new AdvancedCapabilityDtos.InjectionRequest(
            List.of(SYNTHETIC_INJECTOR)
        );
        final AdvancedCapabilityDtos.InjectionDownloadRequest downloadRequest = new AdvancedCapabilityDtos.InjectionDownloadRequest(
            SYNTHETIC_INJECTOR, 0
        );

        assertCode(CAPABILITY_UNAVAILABLE, () -> controller.graph(TOKEN, 1, "ast", AUTHORIZATION).block());
        assertCode(CAPABILITY_UNAVAILABLE, () -> controller.diff(diffRequest).block());
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.export(TOKEN, 1, AUTHORIZATION, exportRequest).block()
        );
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.exportTargets(TOKEN, 1, AUTHORIZATION).block()
        );
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.injectors(TOKEN, 1, AUTHORIZATION, ENGLISH).block()
        );
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.injectorCatalogue(TOKEN, 1, AUTHORIZATION, ENGLISH).block()
        );
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.previewInjection(
                TOKEN, 1, AUTHORIZATION, injectionRequest
            ).block()
        );
        assertCode(
            CAPABILITY_UNAVAILABLE, () -> controller.downloadInjection(
                TOKEN, 1, AUTHORIZATION, downloadRequest
            ).block()
        );
    }

    @Test
    void returnsBoundedDotMetadataWithFixedHeaders() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getMetricsGraphs().setEnabled(true);
        final GraphCapability graph = (token, analysisId, type) -> Mono.just(
            new GraphCapability.GraphResult("digraph { a -> b }", 2, 1)
        );
        final AdvancedCapabilitiesController controller = controller(configuration, graph, null, null, null);

        final var response = controller.graph(TOKEN, 7, "cfg", AUTHORIZATION).block();

        assertThat(response).isNotNull();
        assertThat(response.getHeaders().getContentType().toString())
            .isEqualTo(AdvancedCapabilitiesController.GRAPH_MEDIA_TYPE);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getContentLength()).isEqualTo(
            "digraph { a -> b }".getBytes(StandardCharsets.UTF_8).length
        );
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
        assertThat(response.getHeaders().getFirst("X-LitterBox-Graph-Nodes")).isEqualTo("2");
        assertThat(response.getHeaders().getFirst("X-LitterBox-Graph-Edges")).isEqualTo("1");
        assertThat(response.getBody()).isEqualTo("digraph { a -> b }");
    }

    @Test
    void requiresTheRouteAndBearerTokensToMatch() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getMetricsGraphs().setEnabled(true);
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, null, null);

        assertThatThrownBy(() -> controller.graph(TOKEN, 7, "cfg", "Bearer unrelated-token"))
            .isInstanceOfSatisfying(
                CapabilityException.class,
                error -> assertThat(error.code()).isEqualTo("analysis_not_found")
            );
    }

    @Test
    void passesTwoExplicitAuthorizedReferencesToTheDiffPort() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getSemanticDiff().setEnabled(true);
        final AdvancedCapabilityDtos.DiffView expected = new AdvancedCapabilityDtos.DiffView(
            1,
            new AdvancedCapabilityDtos.SourceView(1, "before"),
            new AdvancedCapabilityDtos.SourceView(2, "after"),
            new AdvancedCapabilityDtos.DiffCounts(0, 0, 0, 0, 0, 0),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of()
        );
        final SemanticDiffCapability diff = request -> Mono.just(expected);
        final AdvancedCapabilitiesController controller = controller(configuration, null, diff, null, null);
        final AdvancedCapabilityDtos.DiffRequest request = new AdvancedCapabilityDtos.DiffRequest(
            new AdvancedCapabilityDtos.AnalysisReference("before-token", 1),
            new AdvancedCapabilityDtos.AnalysisReference("after-token", 2)
        );

        assertThat(controller.diff(request).block()).isEqualTo(expected);
    }

    @Test
    void fixesExportMediaTypeFilenameAndDownloadSecurityHeaders() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getProgramExport().setEnabled(true);
        final ProgramExportCapability export = (token, analysisId, request) -> Mono.just(
            new CapabilityContent("synthetic export".getBytes(StandardCharsets.UTF_8))
        );
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, export, null);
        final AdvancedCapabilityDtos.ExportRequest request = new AdvancedCapabilityDtos.ExportRequest(
            "pystage", new AdvancedCapabilityDtos.ExportTarget("program", null, null)
        );

        final var response = controller.export(TOKEN, 3, AUTHORIZATION, request).block();

        assertThat(response).isNotNull();
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("text/x-python;charset=UTF-8");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .contains("attachment", "litterbox-export.py");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getContentLength()).isEqualTo(
            "synthetic export".getBytes(StandardCharsets.UTF_8).length
        );
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
    }

    @Test
    void returnsAuthorizedExportTargetsWithNonCacheableJsonHeaders() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getProgramExport().setEnabled(true);
        final AdvancedCapabilityDtos.ExportTargetsView expected = new AdvancedCapabilityDtos.ExportTargetsView(
            List.of(new AdvancedCapabilityDtos.ExportSpriteTargetView("Stage", true)),
            List.of(new AdvancedCapabilityDtos.ExportScriptTargetView("script-1", "Stage", 1, "when flag clicked"))
        );
        final ProgramExportCapability export = new ProgramExportCapability() {

            @Override
            public Mono<AdvancedCapabilityDtos.ExportTargetsView> targets(
                final String submissionToken,
                final long analysisId
            ) {
                return Mono.just(expected);
            }

            @Override
            public Mono<CapabilityContent> export(
                final String submissionToken,
                final long analysisId,
                final AdvancedCapabilityDtos.ExportRequest request
            ) {
                return Mono.empty();
            }
        };
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, export, null);

        final var response = controller.exportTargets(TOKEN, 3, AUTHORIZATION).block();

        assertThat(response).isNotNull();
        assertThat(response.getBody()).isEqualTo(expected);
        assertThat(response.getHeaders().getContentType())
            .isEqualTo(org.springframework.http.MediaType.APPLICATION_JSON);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
    }

    @Test
    void supportsMblockAsACompleteDerivedArchive() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getFaultInjection().setEnabled(true);
        final FaultInjectionCapability injection = injectionWithDownload(
            new CapabilityContent(new byte[] { 1, 2, 3 }, "mblock")
        );
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, null, injection);
        final AdvancedCapabilityDtos.InjectionDownloadRequest request = new AdvancedCapabilityDtos.InjectionDownloadRequest(
            SYNTHETIC_INJECTOR, 0
        );

        final var response = controller.downloadInjection(TOKEN, 4, AUTHORIZATION, request).block();

        assertThat(response).isNotNull();
        assertThat(response.getHeaders().getContentType().toString())
            .isEqualTo(AdvancedCapabilitiesController.ARCHIVE_MEDIA_TYPE);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .contains("attachment", "litterbox-derived.mblock");
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getContentLength()).isEqualTo(3);
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
        assertThat(response.getBody()).containsExactly(1, 2, 3);
    }

    @Test
    void offersEveryMutationAsOneArchiveAndRefusesTheSelectionsThePreviewRefuses() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getFaultInjection().setEnabled(true);
        final FaultInjectionCapability injection = injectionWithDownload(
            new CapabilityContent(new byte[] { 4, 5, 6 }, "sb3")
        );
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, null, injection);

        final var response = controller.downloadAllInjections(
            TOKEN, 4, AUTHORIZATION, new AdvancedCapabilityDtos.InjectionRequest(List.of(), true)
        ).block();

        assertThat(response).isNotNull();
        // A bundle of projects is not itself a project, so it goes out under its own name and extension.
        assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
            .contains("attachment", "litterbox-derived-all.zip");
        assertThat(response.getHeaders().getContentType().toString())
            .isEqualTo(AdvancedCapabilitiesController.ARCHIVE_MEDIA_TYPE);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
        assertThat(response.getBody()).containsExactly(4, 5, 6);

        // The complete download takes the same selection as the preview, so it must refuse the same ones.
        assertThatThrownBy(
            () -> controller.downloadAllInjections(
                TOKEN, 4, AUTHORIZATION, new AdvancedCapabilityDtos.InjectionRequest(List.of())
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
            () -> controller.downloadAllInjections(
                TOKEN, 4, AUTHORIZATION, new AdvancedCapabilityDtos.InjectionRequest(List.of("a", "a"))
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void returnsTheBoundedInjectorCatalogueWithNonCacheableJsonHeaders() {
        final AdvancedCapabilitiesConfiguration configuration = new AdvancedCapabilitiesConfiguration();
        configuration.getFaultInjection().setEnabled(true);
        final FaultInjectionCapability injection = injectionWithDownload(
            new CapabilityContent(new byte[] { 1, 2, 3 }, "sb3")
        );
        final AdvancedCapabilitiesController controller = controller(configuration, null, null, null, injection);

        final var response = controller.injectorCatalogue(TOKEN, 4, AUTHORIZATION, ENGLISH).block();

        assertThat(response).isNotNull();
        assertThat(response.getBody()).isEqualTo(
            new AdvancedCapabilityDtos.InjectorCatalogueView(List.of(), 8, true)
        );
        assertThat(response.getHeaders().getContentType())
            .isEqualTo(org.springframework.http.MediaType.APPLICATION_JSON);
        assertThat(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo(NO_STORE);
        assertThat(response.getHeaders().getFirst(CONTENT_TYPE_OPTIONS)).isEqualTo(NOSNIFF);
    }

    private void assertCode(
        final String code, final org.assertj.core.api.ThrowableAssert.ThrowingCallable executable
    ) {
        assertThatThrownBy(executable).isInstanceOfSatisfying(
            CapabilityException.class, error -> assertThat(error.code()).isEqualTo(code)
        );
    }

    private FaultInjectionCapability injectionWithDownload(final CapabilityContent download) {
        return new FaultInjectionCapability() {

            @Override
            public Mono<List<AdvancedCapabilityDtos.InjectorView>> injectors(
                final String submissionToken,
                final long analysisId,
                final String locale
            ) {
                return Mono.just(List.of());
            }

            @Override
            public Mono<AdvancedCapabilityDtos.InjectorCatalogueView> injectorCatalogue(
                final String submissionToken,
                final long analysisId,
                final String locale
            ) {
                return Mono.just(new AdvancedCapabilityDtos.InjectorCatalogueView(List.of(), 8, true));
            }

            @Override
            public Mono<AdvancedCapabilityDtos.InjectionPreview> preview(
                final String submissionToken,
                final long analysisId,
                final AdvancedCapabilityDtos.InjectionRequest request
            ) {
                return Mono.empty();
            }

            @Override
            public Mono<CapabilityContent> download(
                final String submissionToken,
                final long analysisId,
                final AdvancedCapabilityDtos.InjectionDownloadRequest request
            ) {
                return Mono.just(download);
            }

            @Override
            public Mono<CapabilityContent> downloadAll(
                final String submissionToken,
                final long analysisId,
                final AdvancedCapabilityDtos.InjectionRequest request
            ) {
                return Mono.just(new CapabilityContent(download.bytes(), "zip"));
            }
        };
    }

    private AdvancedCapabilitiesController controller(
        final AdvancedCapabilitiesConfiguration configuration,
        final GraphCapability graph,
        final SemanticDiffCapability diff,
        final ProgramExportCapability export,
        final FaultInjectionCapability injection
    ) {
        return new AdvancedCapabilitiesController(
            configuration, provider(graph), provider(diff), provider(export), provider(injection)
        );
    }

    @SuppressWarnings("unchecked")
    private <T> ObjectProvider<T> provider(final T value) {
        final ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(value);
        return provider;
    }
}
