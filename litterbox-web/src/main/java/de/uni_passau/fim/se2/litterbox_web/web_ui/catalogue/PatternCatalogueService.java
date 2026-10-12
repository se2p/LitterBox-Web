/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.MissingResourceException;
import java.util.Objects;

import de.uni_passau.fim.se2.litterbox.analytics.IssueType;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;

/** Supplies deterministic structured catalogue content and core translation fallbacks. */
public final class PatternCatalogueService {

    private final PatternCatalogueLoader.LoadedCatalogue catalogue;

    /** Loads the checked-in catalogue resources. */
    public PatternCatalogueService() {
        this(
            new PatternCatalogueLoader.ClasspathResourceSource(
                PatternCatalogueService.class.getClassLoader()
            )
        );
    }

    PatternCatalogueService(final PatternCatalogueLoader.ResourceSource source) {
        catalogue = new PatternCatalogueLoader(source).load();
    }

    /**
     * Returns all active catalogue entries in finder-id order.
     *
     * @param locale requested locale
     * @return active catalogue entries
     */
    public List<PatternCatalogueEntry> entries(final Locale locale) {
        final Locale requestedLocale = normalizeLocale(locale);
        return catalogue.activeFinders().keySet().stream()
            .sorted(Comparator.naturalOrder())
            .map(finderId -> buildEntry(finderId, requestedLocale))
            .toList();
    }

    /**
     * Returns one active catalogue entry for the requested locale.
     *
     * @param finderId finder identifier
     * @param locale   requested locale
     * @return active catalogue entry
     */
    public PatternCatalogueEntry entry(final String finderId, final Locale locale) {
        Objects.requireNonNull(finderId, "finderId");
        if (!catalogue.activeFinders().containsKey(finderId)) {
            throw new IllegalArgumentException("Unknown finder: " + finderId);
        }
        return buildEntry(finderId, normalizeLocale(locale));
    }

    private PatternCatalogueEntry buildEntry(final String finderId, final Locale requestedLocale) {
        final PatternCatalogueLoader.CoreFinder coreFinder = catalogue.activeFinders().get(finderId);

        final Map<String, PatternCatalogueLoader.Overlay> finderOverlays = catalogue.overlays()
            .getOrDefault(finderId, Map.of());
        final PatternCatalogueLoader.Overlay requestedOverlay = finderOverlays.get(requestedLocale.getLanguage());
        final PatternCatalogueLoader.Overlay englishOverlay = finderOverlays.get("en");
        final PatternCatalogueLoader.Overlay selectedOverlay = requestedOverlay != null
            ? requestedOverlay
            : englishOverlay;
        if (selectedOverlay == null) {
            return coreFallback(finderId, "en", coreFinder.issueType(), coreFinder.blockSet());
        }

        final String usedLanguage = selectedOverlay.locale();
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(Locale.of(usedLanguage));
        final String name = selectedOverlay.name() != null
            ? selectedOverlay.name()
            : translatedName(translator, finderId);
        final String hint = selectedOverlay.hint() != null
            ? selectedOverlay.hint()
            : translatedHint(translator, finderId);
        final String instruction = selectedOverlay.instruction() != null ? selectedOverlay.instruction() : hint;
        final List<PatternCatalogueEntry.WorkedExample> examples = selectedOverlay.examples() != null
            ? selectedOverlay.examples()
            : List.of();

        return new PatternCatalogueEntry(
            finderId,
            coreFinder.issueType(),
            coreFinder.blockSet(),
            usedLanguage,
            name,
            hint,
            instruction,
            examples,
            usesFallback(requestedLocale, usedLanguage, selectedOverlay)
        );
    }

    /**
     * True when the reader is not being shown everything in the language they asked for, either because the overlay
     * came from English instead or because a field of it was left for the core translations to supply.
     */
    private boolean usesFallback(
        final Locale requestedLocale,
        final String usedLanguage,
        final PatternCatalogueLoader.Overlay selectedOverlay
    ) {
        if (!requestedLocale.getLanguage().equals(usedLanguage)) {
            return true;
        }
        return selectedOverlay.name() == null
            || selectedOverlay.hint() == null
            || selectedOverlay.instruction() == null
            || selectedOverlay.examples() == null;
    }

    private PatternCatalogueEntry coreFallback(
        final String finderId,
        final String usedLanguage,
        final IssueType issueType,
        final FinderBlockSet blockSet
    ) {
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(Locale.of(usedLanguage));
        final String name = translatedName(translator, finderId);
        final String hint = translatedHint(translator, finderId);
        return new PatternCatalogueEntry(
            finderId,
            issueType,
            blockSet,
            usedLanguage,
            name,
            hint,
            hint,
            List.of(),
            true
        );
    }

    private Locale normalizeLocale(final Locale locale) {
        Objects.requireNonNull(locale, "locale");
        final String language = PatternCatalogueLoader.SUPPORTED_LOCALES.contains(locale.getLanguage())
            ? locale.getLanguage()
            : "en";
        return Locale.of(language);
    }

    private String translatedName(final IssueTranslator translator, final String finderId) {
        try {
            return translator.getName(finderId);
        }
        catch (MissingResourceException ignored) {
            return finderId;
        }
    }

    private String translatedHint(final IssueTranslator translator, final String finderId) {
        try {
            return translator.getHint(finderId);
        }
        catch (MissingResourceException ignored) {
            return finderId;
        }
    }
}
