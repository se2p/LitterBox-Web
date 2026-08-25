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

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

import de.uni_passau.fim.se2.litterbox.analytics.IssueFinder;
import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.analytics.IssueType;
import de.uni_passau.fim.se2.litterbox.analytics.mblock.AbstractRobotFinder;
import de.uni_passau.fim.se2.litterbox.utils.FinderGroup;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Loads the presentation-neutral catalogue resources.
 */
final class PatternCatalogueLoader {

    static final List<String> SUPPORTED_LOCALES = List.of("de", "en", "es", "nl");

    private static final Pattern STABLE_ID = Pattern.compile("[a-z0-9]+(?:[_-][a-z0-9]+)*");
    private static final JsonMapper MAPPER = JsonMapper.shared();

    private final ResourceSource source;
    private final Map<String, CoreFinder> activeFinders;

    PatternCatalogueLoader(final ResourceSource source) {
        this.source = Objects.requireNonNull(source);
        this.activeFinders = loadActiveFinders();
    }

    LoadedCatalogue load() {
        try {
            return new LoadedCatalogue(activeFinders, loadOverlays());
        }
        catch (IOException exception) {
            throw new IllegalStateException("Could not read catalogue resources", exception);
        }
    }

    private Map<String, CoreFinder> loadActiveFinders() {
        final Map<String, CoreFinder> result = new TreeMap<>();
        final Set<String> quantumFinders = IssueTool.getFinders(FinderGroup.QUANTUM).stream()
            .map(IssueFinder::getName)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
        addActiveFinders(result, FinderGroup.BUGS, IssueType.BUG, quantumFinders);
        addActiveFinders(result, FinderGroup.SMELLS, IssueType.SMELL, quantumFinders);
        addActiveFinders(result, FinderGroup.PERFUMES, IssueType.PERFUME, quantumFinders);
        return Map.copyOf(result);
    }

    private void addActiveFinders(
        final Map<String, CoreFinder> result,
        final FinderGroup finderGroup,
        final IssueType issueType,
        final Set<String> quantumFinders
    ) {
        for (IssueFinder finder : IssueTool.getFinders(finderGroup)) {
            final FinderBlockSet blockSet;
            if (quantumFinders.contains(finder.getName())) {
                blockSet = FinderBlockSet.QSCRATCH;
            }
            else if (finder instanceof AbstractRobotFinder) {
                blockSet = FinderBlockSet.MBLOCK;
            }
            else {
                blockSet = FinderBlockSet.SCRATCH;
            }
            final CoreFinder previous = result.put(
                finder.getName(), new CoreFinder(finder.getName(), issueType, blockSet)
            );
            if (previous != null) {
                throw new IllegalStateException("Duplicate active finder id in core: " + finder.getName());
            }
        }
    }

    private Map<String, Map<String, Overlay>> loadOverlays() throws IOException {
        final Map<String, Map<String, Overlay>> overlays = new TreeMap<>();
        for (ResourceDocument document : source.resources("i18n")) {
            final Overlay overlay = toOverlay(read(document), document.name());
            final Map<String, Overlay> finderOverlays = overlays.computeIfAbsent(
                overlay.finderId(), ignored -> new TreeMap<>()
            );
            if (finderOverlays.put(overlay.locale(), overlay) != null) {
                throw invalid(
                    document.name(),
                    "duplicate locale '" + overlay.locale() + "' for finder '" + overlay.finderId() + "'"
                );
            }
        }

        final Map<String, Map<String, Overlay>> immutable = new TreeMap<>();
        overlays.forEach(
            (finderId, finderOverlays) -> immutable.put(
                finderId, Map.copyOf(finderOverlays)
            )
        );
        return Map.copyOf(immutable);
    }

    private static OverlayDocument read(final ResourceDocument document) {
        try {
            final OverlayDocument overlay = MAPPER.readValue(document.content(), OverlayDocument.class);
            if (overlay == null) {
                throw invalid(document.name(), "empty JSON document");
            }
            return overlay;
        }
        catch (JacksonException malformed) {
            throw invalid(document.name(), "invalid JSON: " + malformed.getMessage());
        }
    }

    /**
     * Checks what binding to a record cannot: that the finder id is well formed and known to the analyser, that the
     * locale is one this build carries, and that no text present is blank.
     */
    private Overlay toOverlay(final OverlayDocument document, final String sourceName) {
        // An overlay carries nothing but text: which finder it describes, and how bad an occurrence of that
        // finder is, are the analyser's to say, so the id here has to be one the analyser already knows.
        final String finderId = required(document.finderId(), "finderId", sourceName);
        if (!STABLE_ID.matcher(finderId).matches()) {
            throw invalid(sourceName, "field 'finderId' is not a stable finder id");
        }
        if (!activeFinders.containsKey(finderId)) {
            throw invalid(sourceName, "unknown finder reference '" + finderId + "'");
        }
        final String locale = required(document.locale(), "locale", sourceName);
        if (!SUPPORTED_LOCALES.contains(locale)) {
            throw invalid(sourceName, "unsupported locale '" + locale + "'");
        }
        return new Overlay(
            finderId,
            locale,
            optional(document.name(), "name", sourceName),
            optional(document.hint(), "hint", sourceName),
            optional(document.instruction(), "instruction", sourceName),
            examples(document.examples(), sourceName)
        );
    }

    private static String required(final String value, final String field, final String sourceName) {
        if (value == null || value.isBlank()) {
            throw invalid(sourceName, "field '" + field + "' must be a non-blank string");
        }
        return value;
    }

    private static String optional(final String value, final String field, final String sourceName) {
        return value == null ? null : required(value, field, sourceName);
    }

    private static List<PatternCatalogueEntry.WorkedExample> examples(
        final List<OverlayDocument.Example> examples,
        final String sourceName
    ) {
        if (examples == null) {
            return null;
        }
        final List<PatternCatalogueEntry.WorkedExample> worked = new ArrayList<>();
        for (OverlayDocument.Example example : examples) {
            if (example == null) {
                throw invalid(sourceName, "field 'examples' must not contain nulls");
            }
            worked.add(
                new PatternCatalogueEntry.WorkedExample(
                    required(example.label(), "label", sourceName),
                    required(example.scratchblocks(), "scratchblocks", sourceName)
                )
            );
        }
        return List.copyOf(worked);
    }

    private static IllegalStateException invalid(final String sourceName, final String message) {
        return new IllegalStateException("Invalid catalogue resource " + sourceName + ": " + message);
    }

    interface ResourceSource {

        List<ResourceDocument> resources(String directory) throws IOException;
    }

    /**
     * The catalogue documents on the classpath, whether this is running from a directory of classes or from the
     * packaged jar.
     *
     * <p>
     * {@code classpath*:} searches every classpath root and hides the difference between the two, so neither case needs
     * handling here.
     */
    static final class ClasspathResourceSource implements ResourceSource {

        private final ResourcePatternResolver resolver;

        ClasspathResourceSource(final ClassLoader classLoader) {
            resolver = new PathMatchingResourcePatternResolver(Objects.requireNonNull(classLoader));
        }

        @Override
        public List<ResourceDocument> resources(final String directory) throws IOException {
            final String pattern = "classpath*:litterbox-web-catalogue/" + directory + "/*.json";
            final List<ResourceDocument> documents = new ArrayList<>();
            for (Resource resource : resolver.getResources(pattern)) {
                try (InputStream content = resource.getInputStream()) {
                    documents.add(new ResourceDocument(resource.getURL().toString(), content.readAllBytes()));
                }
            }
            documents.sort(Comparator.comparing(ResourceDocument::name));
            return List.copyOf(documents);
        }
    }

    /** One catalogue resource as it is written; its shape is fixed by {@code catalogue.schema.json}. */
    record OverlayDocument(
        String finderId,
        String locale,
        String name,
        String hint,
        String instruction,
        List<Example> examples
    ) {

        record Example(String label, String scratchblocks) {
        }
    }

    record ResourceDocument(String name, byte[] content) {
    }

    record CoreFinder(String id, IssueType issueType, FinderBlockSet blockSet) {
    }

    record Overlay(
        String finderId,
        String locale,
        String name,
        String hint,
        String instruction,
        List<PatternCatalogueEntry.WorkedExample> examples
    ) {
    }

    record LoadedCatalogue(
        Map<String, CoreFinder> activeFinders,
        Map<String, Map<String, Overlay>> overlays
    ) {

        LoadedCatalogue {
            activeFinders = Map.copyOf(activeFinders);
            overlays = Map.copyOf(overlays);
        }
    }

}
