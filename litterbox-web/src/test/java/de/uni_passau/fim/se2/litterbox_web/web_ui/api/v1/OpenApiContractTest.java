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

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import de.uni_passau.fim.se2.litterbox_web.LitterboxWebIntegrationTest;
import de.uni_passau.fim.se2.litterbox_web.util.RequestUtilService;
import tools.jackson.databind.JsonNode;

class OpenApiContractTest extends LitterboxWebIntegrationTest {

    private static final String COMPONENTS = "components";
    private static final String SCHEMAS = "schemas";
    private static final String PROPERTIES = "properties";

    @Autowired
    private RequestUtilService requestUtilService;

    @Test
    void documentsTheCatalogueContractConsumedByTheFrontend() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );
        final JsonNode schema = specification.path(COMPONENTS).path(SCHEMAS).path("CatalogueView");

        assertThat(schema.isObject()).isTrue();
        // Severity is not among them: it belongs to a finding in a program, not to a kind of finding.
        assertThat(schema.path(PROPERTIES).propertyNames())
            .contains(
                "id", "title", "description", "locale", "fallback", "instruction",
                "examples", "issueType", "platform", "blockSet"
            );
        assertThat(schema.at("/properties/issueType/type").asString()).isEqualTo("string");
        assertThat(schema.at("/properties/platform/type").asString()).isEqualTo("string");
        assertThat(schema.at("/properties/blockSet/type").asString()).isEqualTo("string");
        assertThat(schema.at("/properties/fallback/type").asString()).isEqualTo("boolean");
    }

    @Test
    void documentsTheIssueSpecificThumbnailReference() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );
        final JsonNode schema = specification.path(COMPONENTS).path(SCHEMAS).path("IssueView");

        assertThat(schema.isObject()).isTrue();
        assertThat(schema.path(PROPERTIES).propertyNames()).contains("thumbnailRef");
        assertThat(schema.at("/properties/thumbnailRef/type").asString()).isEqualTo("string");
    }

    @Test
    void documentsDedicatedQuestionSubmissions() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );
        final JsonNode paths = specification.path("paths");
        final JsonNode schema = specification.path(COMPONENTS).path(SCHEMAS)
            .path("QuestionProjectUrlRequest");

        assertThat(paths.has("/api/v1/question-submissions")).isTrue();
        // Questions about a project this service already holds are asked by naming it, not by uploading it again.
        assertThat(paths.has("/api/v1/submissions/{token}/reuse")).isTrue();
        assertThat(
            specification.path(COMPONENTS).path(SCHEMAS).path("ReuseRequest").path(PROPERTIES).propertyNames()
        ).containsExactly("analysis");
        assertThat(
            paths.path("/api/v1/question-submissions").path("post")
                .path("requestBody").path("content").propertyNames()
        )
            .contains("application/json", "multipart/form-data");
        assertThat(schema.path(PROPERTIES).propertyNames()).containsExactly("projectUrl");
    }

    /** The size of a studio has to be readable before it is submitted; afterwards there is nothing left to decide. */
    @Test
    void documentsTheStudioSummaryReadBeforeSubmission() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );

        assertThat(specification.path("paths").has("/api/v1/studios/{studioId}")).isTrue();
        assertThat(
            specification.path(COMPONENTS).path(SCHEMAS).path("StudioSummaryView").path(PROPERTIES).propertyNames()
        ).containsExactlyInAnyOrder("studioId", "title", "readable", "projects");
    }

    @Test
    void documentsThePublicStatisticsContractConsumedByTheFrontend() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );
        final JsonNode paths = specification.path("paths");
        final JsonNode schema = specification.path(COMPONENTS).path(SCHEMAS).path("PublicStatisticsDto");

        assertThat(paths.has("/api/v1/statistics/public")).isTrue();
        assertThat(schema.path(PROPERTIES).propertyNames()).containsExactlyInAnyOrder(
            "schemaVersion", "available", "generatedAt", "totals", "distributions", "findingGroups",
            "blockCategories"
        );
        final String distributionReference = schema.at("/properties/distributions/items/$ref").asString();
        final String distributionName = distributionReference.substring(distributionReference.lastIndexOf('/') + 1);
        final JsonNode distribution = specification.path(COMPONENTS).path(SCHEMAS).path(distributionName);
        assertThat(distribution.path(PROPERTIES).propertyNames()).containsExactlyInAnyOrder(
            "metric", "sampleSize", "minimum", "p25", "median", "p75", "p95", "displayMaximum", "zeroCount",
            "zeroPrevalence", "points"
        );
    }

    @Test
    void documentsTheSourceDerivedCapabilityContracts() {
        final JsonNode specification = requestUtilService.get(
            "/v3/api-docs", JsonNode.class, HttpStatus.OK
        );
        final JsonNode paths = specification.path("paths");

        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/graphs/{graphType}"))
            .isTrue();
        assertThat(paths.has("/api/v1/diffs")).isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/exports")).isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/export-targets")).isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/injectors")).isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/injector-catalogue"))
            .isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/injections")).isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/injections/download"))
            .isTrue();
        assertThat(paths.has("/api/v1/submissions/{submissionToken}/analyses/{analysisId}/injections/download-all"))
            .isTrue();

        final JsonNode schemas = specification.path(COMPONENTS).path(SCHEMAS);
        assertThat(schemas.path("DiffRequest").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("before", "after");
        assertThat(schemas.path("DiffView").path(PROPERTIES).propertyNames())
            .contains(
                "schemaVersion", "before", "after", "counts", "fixed", "newIssues", "persisting", "removed",
                "actors"
            );
        assertThat(schemas.path("ExportRequest").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("format", "target");
        assertThat(schemas.path("ExportTargetsView").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("sprites", "scripts");
        assertThat(schemas.path("ExportSpriteTargetView").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("name", "stage");
        assertThat(schemas.path("ExportScriptTargetView").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("scriptId", "spriteName", "ordinal", "scratchblocks");
        assertThat(schemas.path("InjectionPreview").path(PROPERTIES).propertyNames())
            .contains("schemaVersion", "source", "results", "failures");
        assertThat(schemas.path("InjectorCatalogueView").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("injectors", "maxSelectedInjectors", "allSelectionSupported");
        assertThat(schemas.path("InjectionRequest").path(PROPERTIES).propertyNames())
            .containsExactlyInAnyOrder("injectorIds", "all");
    }
}
