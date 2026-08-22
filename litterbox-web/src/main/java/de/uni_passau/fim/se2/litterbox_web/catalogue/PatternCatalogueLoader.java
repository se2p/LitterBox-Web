/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.catalogue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.JarURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.regex.Pattern;

import de.uni_passau.fim.se2.litterbox.analytics.IssueFinder;
import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.analytics.IssueType;
import de.uni_passau.fim.se2.litterbox.analytics.mblock.AbstractRobotFinder;
import de.uni_passau.fim.se2.litterbox.utils.FinderGroup;
import tools.jackson.databind.JsonNode;
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
            // todo: why the manual JSON parsing instead of a DTO that can be loaded directly by Jackson?
            final JsonNode node = parse(document.content(), document.name());
            // An overlay carries nothing but text: which finder it describes, and how bad an occurrence of that
            // finder is, are the analyser's to say, so the id here has to be one the analyser already knows.
            final String finderId = requiredStableId(node, "finderId", document.name());
            if (!activeFinders.containsKey(finderId)) {
                throw invalid(document.name(), "unknown finder reference '" + finderId + "'");
            }
            final String locale = requiredLocale(node, document.name());
            final Overlay overlay = new Overlay(
                finderId,
                locale,
                optionalText(node, "name", document.name()),
                optionalText(node, "hint", document.name()),
                optionalText(node, "instruction", document.name()),
                optionalExamples(node, document.name())
            );
            final Map<String, Overlay> finderOverlays = overlays.computeIfAbsent(
                finderId, ignored -> new TreeMap<>()
            );
            if (finderOverlays.put(locale, overlay) != null) {
                throw invalid(
                    document.name(),
                    "duplicate locale '" + locale + "' for finder '" + finderId + "'"
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

    private JsonNode parse(final byte[] content, final String sourceName) {
        return parse(new ByteArrayInputStream(content), sourceName);
    }

    private JsonNode parse(final InputStream content, final String sourceName) {
        final JsonNode node = MAPPER.readTree(content);
        if (node == null) {
            throw invalid(sourceName, "empty JSON document");
        }
        return node;
    }

    private static String requiredStableId(
        final JsonNode node,
        final String field,
        final String sourceName
    ) {
        final String value = requiredText(node, field, sourceName);
        if (!STABLE_ID.matcher(value).matches()) {
            throw invalid(sourceName, "field '" + field + "' is not a stable finder id");
        }
        return value;
    }

    private static String requiredLocale(final JsonNode node, final String sourceName) {
        final String locale = requiredText(node, "locale", sourceName);
        if (!SUPPORTED_LOCALES.contains(locale)) {
            throw invalid(sourceName, "unsupported locale '" + locale + "'");
        }
        return locale;
    }

    private static String requiredText(
        final JsonNode node,
        final String field,
        final String sourceName
    ) {
        final JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) {
            throw invalid(sourceName, "field '" + field + "' must be a non-blank string");
        }
        return value.textValue();
    }

    private static String optionalText(
        final JsonNode node,
        final String field,
        final String sourceName
    ) {
        if (!node.has(field)) {
            return null;
        }
        return requiredText(node, field, sourceName);
    }

    private static List<PatternCatalogueEntry.WorkedExample> optionalExamples(
        final JsonNode node,
        final String sourceName
    ) {
        if (!node.has("examples")) {
            return null;
        }
        final JsonNode values = node.get("examples");
        if (!values.isArray()) {
            throw invalid(sourceName, "field 'examples' must be an array");
        }
        final List<PatternCatalogueEntry.WorkedExample> examples = new ArrayList<>();
        for (JsonNode example : values) {
            final String label = requiredText(example, "label", sourceName);
            final String scratchblocks = requiredText(example, "scratchblocks", sourceName);
            examples.add(new PatternCatalogueEntry.WorkedExample(label, scratchblocks));
        }
        return List.copyOf(examples);
    }

    private static IllegalStateException invalid(final String sourceName, final String message) {
        return new IllegalStateException("Invalid catalogue resource " + sourceName + ": " + message);
    }

    interface ResourceSource {

        List<ResourceDocument> resources(String directory) throws IOException;
    }

    // todo: There has to be some Spring Boot builtin to get the resources independent of file/JAR‽
    static final class ClasspathResourceSource implements ResourceSource {

        private final ClassLoader classLoader;

        ClasspathResourceSource(final ClassLoader classLoader) {
            this.classLoader = Objects.requireNonNull(classLoader);
        }

        @Override
        public List<ResourceDocument> resources(final String directory) throws IOException {
            final List<ResourceDocument> documents = new ArrayList<>();
            final Enumeration<URL> locations = classLoader.getResources("litterbox-web-catalogue/" + directory);
            while (locations.hasMoreElements()) {
                final URL location = locations.nextElement();
                if ("file".equals(location.getProtocol())) {
                    readDirectory(Path.of(toUri(location)), documents);
                }
                else if ("jar".equals(location.getProtocol())) {
                    readJar(location, directory, documents);
                }
            }
            documents.sort(Comparator.comparing(ResourceDocument::name));
            return List.copyOf(documents);
        }

        private static void readDirectory(
            final Path directory,
            final List<ResourceDocument> documents
        ) throws IOException {
            if (!Files.isDirectory(directory)) {
                return;
            }
            try (var paths = Files.list(directory)) {
                paths.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".json"))
                    .sorted()
                    .forEach(path -> {
                        try {
                            documents.add(new ResourceDocument(path.toString(), Files.readAllBytes(path)));
                        }
                        catch (IOException exception) {
                            throw new CatalogueIOException(exception);
                        }
                    });
            }
            catch (CatalogueIOException exception) {
                throw exception.ioException();
            }
        }

        private static void readJar(
            final URL location,
            final String directory,
            final List<ResourceDocument> documents
        ) throws IOException {
            final JarURLConnection connection = (JarURLConnection) location.openConnection();
            connection.setUseCaches(false);
            final String prefix = "litterbox-web-catalogue/" + directory + "/";
            try (JarFile jar = connection.getJarFile()) {
                final List<JarEntry> entries = jar.stream()
                    .filter(
                        entry -> !entry.isDirectory()
                            && entry.getName().startsWith(prefix)
                            && entry.getName().indexOf('/', prefix.length()) < 0
                            && entry.getName().endsWith(".json")
                    )
                    .sorted(Comparator.comparing(JarEntry::getName))
                    .toList();
                for (JarEntry entry : entries) {
                    try (InputStream input = jar.getInputStream(entry)) {
                        documents.add(new ResourceDocument(entry.getName(), input.readAllBytes()));
                    }
                }
            }
        }

        private static URI toUri(final URL url) {
            try {
                return url.toURI();
            }
            catch (URISyntaxException exception) {
                throw new IllegalStateException("Invalid catalogue resource URL: " + url, exception);
            }
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

    private static final class CatalogueIOException extends RuntimeException {

        private final IOException ioException;

        CatalogueIOException(final IOException ioException) {
            this.ioException = ioException;
        }

        IOException ioException() {
            return ioException;
        }
    }
}
