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
import java.util.Locale;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectDtos;

@RestController
@RequestMapping({ ApiV1.BASE_PATH, ApiV1.WEB_BASE_PATH })
public class CatalogueController {

    private final PatternCatalogueService catalogueService = new PatternCatalogueService();

    @GetMapping("/catalogue")
    public List<SingleProjectDtos.CatalogueView> catalogue(
        @RequestParam(defaultValue = "en") final String locale
    ) {
        final String language = ApiV1.SUPPORTED_LOCALES.contains(locale) ? locale : "en";
        return catalogueService.entries(Locale.of(language)).stream()
            .map(SingleProjectDtos.CatalogueView::from)
            .toList();
    }
}
