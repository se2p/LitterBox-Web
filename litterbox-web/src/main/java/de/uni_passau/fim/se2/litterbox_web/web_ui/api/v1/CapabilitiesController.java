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

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai.AskAiConfigurationProperties;
import de.uni_passau.fim.se2.litterbox_web.web_ui.assessment.AssessmentCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.AdvancedCapabilitiesConfiguration;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public final class CapabilitiesController {

    private static final List<String> FOUNDATION_FEATURES = List.of(
        "single-project", "teacher-archive", "studio", "feedback", "qlc", "catalogue"
    );
    private static final String ASK_AI = "ask-ai";
    private static final String CORE_POM_PROPERTIES = "META-INF/maven/de.uni_passau.fim.se2/Litterbox/pom.properties";

    private final String litterboxVersion;
    private final Set<String> enabledFeatures;
    private final AssessmentLimitsDto assessmentLimits;

    public CapabilitiesController(
        @Value("${litterbox.version:unknown}") final String configuredVersion,
        final AdvancedCapabilitiesConfiguration advancedCapabilities,
        final AskAiConfigurationProperties askAiConfiguration,
        final AssessmentCapabilitiesConfiguration assessmentCapabilities
    ) {
        litterboxVersion = coreArtifactVersion();
        if (!litterboxVersion.equals(configuredVersion)) {
            throw new IllegalStateException(
                "Configured LitterBox version " + configuredVersion
                    + " does not match the runtime artifact " + litterboxVersion
            );
        }
        final Set<String> features = new LinkedHashSet<>(FOUNDATION_FEATURES);
        features.addAll(advancedCapabilities.enabledFeatures());
        if (askAiConfiguration.isReady()) {
            features.add(ASK_AI);
        }
        if (assessmentCapabilities.isEnabled()) {
            features.add(AssessmentCapabilitiesConfiguration.ASSESSMENTS);
        }
        enabledFeatures = Collections.unmodifiableSet(features);
        if (assessmentCapabilities.isEnabled()) {
            assessmentLimits = AssessmentLimitsDto.of(assessmentCapabilities);
        }
        else {
            assessmentLimits = null;
        }
    }

    @GetMapping("/capabilities")
    public CapabilitiesDto getCapabilities() {
        return new CapabilitiesDto(
            ApiV1.SCHEMA_VERSION,
            litterboxVersion,
            ApiV1.SUPPORTED_LOCALES,
            enabledFeatures,
            assessmentLimits
        );
    }

    private String coreArtifactVersion() {
        final Properties properties = new Properties();
        try (
            InputStream input = IssueTool.class.getClassLoader()
                .getResourceAsStream(CORE_POM_PROPERTIES)
        ) {
            if (input == null) {
                throw new IllegalStateException("LitterBox runtime artifact version metadata is missing");
            }
            properties.load(input);
            final String version = properties.getProperty("version");
            if (version == null || version.isBlank()) {
                throw new IllegalStateException("LitterBox runtime artifact version metadata is invalid");
            }
            return version;
        }
        catch (IOException error) {
            throw new IllegalStateException("Could not read LitterBox runtime artifact version metadata", error);
        }
    }
}
