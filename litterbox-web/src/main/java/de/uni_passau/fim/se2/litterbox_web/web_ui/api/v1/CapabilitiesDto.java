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

import java.util.List;
import java.util.Set;

/**
 * What this server supports, as reported by the capabilities endpoint.
 *
 * @param schemaVersion    the version of the API's response schema
 * @param litterboxVersion the version of the LitterBox core the server analyses with
 * @param supportedLocales the locales reports can be produced in
 * @param enabledFeatures  the optional features switched on for this server
 * @param assessmentLimits limits accepted by assessment endpoints, or {@code null} when assessments are disabled
 */
public record CapabilitiesDto(
    int schemaVersion,
    String litterboxVersion,
    List<String> supportedLocales,
    Set<String> enabledFeatures,
    AssessmentLimitsDto assessmentLimits
) {
}
