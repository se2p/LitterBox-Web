/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.capabilities.injection;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.SequencedCollection;
import java.util.function.Supplier;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.visitor.CloneVisitor;
import de.uni_passau.fim.se2.litterbox.ast.visitor.ParentVisitor;
import de.uni_passau.fim.se2.litterbox.injection.BugInjector;
import de.uni_passau.fim.se2.litterbox.injection.InjectionResult;
import de.uni_passau.fim.se2.litterbox.injection.InjectorTool;

/**
 * Applies selected bug injectors to parsed programs without crossing a file boundary.
 */
public final class InjectionService {

    /** Maximum number of explicitly selected injectors in one request. */
    public static final int MAX_SELECTED_INJECTORS = 8;

    private static final List<SupportedInjector> SUPPORTED_INJECTORS = createCatalogue(
        InjectorTool.generateBugInjectors()
    );
    private static final Comparator<Injection> INJECTION_ORDER = Comparator
        .comparing(Injection::spriteName)
        .thenComparing(Injection::originalScriptId)
        .thenComparing(Injection::mutatedScriptId)
        .thenComparing(Injection::originalScriptScratchBlocks)
        .thenComparing(Injection::mutatedScriptScratchBlocks);

    private final Supplier<Map<String, BugInjector>> injectorSupplier;
    /* What this instance injects with: the built-in catalogue, unless synthetic injectors were supplied to it. */
    private final List<SupportedInjector> supportedInjectors;
    private final Map<String, SupportedInjector> supportedById;

    /** Creates a service backed by the built-in injector catalogue. */
    public InjectionService() {
        this(InjectorTool::generateBugInjectors);
    }

    private InjectionService(final Supplier<Map<String, BugInjector>> injectorSupplier) {
        this.injectorSupplier = Objects.requireNonNull(injectorSupplier, "injector supplier must not be null");
        final Map<String, BugInjector> initialInjectors = Objects.requireNonNull(
            injectorSupplier.get(), "injector catalogue must not be null"
        );
        this.supportedInjectors = createCatalogue(initialInjectors);
        this.supportedById = indexCatalogue(supportedInjectors);
    }

    /* Test and package integrations may provide synthetic injectors without changing the public catalogue. */
    InjectionService(final Map<String, BugInjector> injectors) {
        this(() -> new LinkedHashMap<>(Objects.requireNonNull(injectors, "injectors must not be null")));
    }

    /**
     * Returns the immutable built-in catalogue in canonical injector-id order.
     *
     * @return supported injector and finder identifiers
     */
    public static List<SupportedInjector> supportedInjectors() {
        return SUPPORTED_INJECTORS;
    }

    /**
     * Applies every built-in injector in canonical order.
     *
     * @param program parsed program to use as the source
     * @return immutable outcomes, including explicit failures
     */
    public Response inject(final Program program) {
        return execute(program, supportedInjectors.stream().map(SupportedInjector::injectorId).toList());
    }

    /**
     * Applies the requested injectors in explicit sequence order, or canonical injector-id order when the supplied
     * collection has no defined encounter order.
     *
     * <p>
     * Identifiers are exact and case-sensitive. An empty collection is a valid request that performs no work; use
     * {@link #inject(Program)} for the complete canonical catalogue.
     *
     * @param program     parsed program to use as the source
     * @param injectorIds explicit injector identifiers
     * @return immutable outcomes, including explicit failures
     */
    public Response inject(final Program program, final Collection<String> injectorIds) {
        Objects.requireNonNull(program, "program must not be null");
        Objects.requireNonNull(injectorIds, "injector ids must not be null");

        if (injectorIds.size() > MAX_SELECTED_INJECTORS) {
            throw new IllegalArgumentException("Too many injector ids selected");
        }

        final List<String> orderedIds = new ArrayList<>(injectorIds.size());
        for (String injectorId : injectorIds) {
            if (injectorId == null || injectorId.isBlank()) {
                throw new IllegalArgumentException("Injector id must not be blank");
            }
            if (!supportedById.containsKey(injectorId)) {
                throw new IllegalArgumentException("Unknown injector id");
            }
            if (orderedIds.contains(injectorId)) {
                throw new IllegalArgumentException("Duplicate injector id");
            }
            orderedIds.add(injectorId);
        }

        if (!(injectorIds instanceof SequencedCollection<?>)) {
            orderedIds.sort(Comparator.naturalOrder());
        }

        return execute(program, List.copyOf(orderedIds));
    }

    private Response execute(final Program program, final List<String> orderedIds) {
        Objects.requireNonNull(program, "program must not be null");
        final Map<String, BugInjector> injectors = Objects.requireNonNull(
            injectorSupplier.get(), "injector catalogue must not be null"
        );
        final List<InjectorOutcome> outcomes = new ArrayList<>();

        for (String injectorId : orderedIds) {
            final SupportedInjector descriptor = supportedById.get(injectorId);
            final BugInjector injector = injectors.get(injectorId);
            if (injector == null) {
                outcomes.add(failedOutcome(descriptor, FailureCode.INJECTOR_UNAVAILABLE));
                continue;
            }

            try {
                final Program workingCopy = cloneProgram(program);
                final List<InjectionResult> rawResults = injector.inject(workingCopy);
                if (rawResults == null) {
                    throw new IllegalStateException("Injector returned no result list");
                }

                final List<Injection> mutations = new ArrayList<>(rawResults.size());
                for (InjectionResult rawResult : rawResults) {
                    if (rawResult == null || rawResult.mutatedProgram() == null) {
                        throw new IllegalStateException("Injector returned an invalid result");
                    }
                    mutations.add(toServiceResult(descriptor, rawResult));
                }
                mutations.sort(INJECTION_ORDER);
                outcomes.add(new InjectorOutcome(descriptor.injectorId(), descriptor.finderId(), mutations, null));
            }
            catch (RuntimeException ignored) {
                outcomes.add(failedOutcome(descriptor, FailureCode.INJECTOR_FAILED));
            }
        }

        return new Response(outcomes);
    }

    private Injection toServiceResult(final SupportedInjector descriptor, final InjectionResult rawResult) {
        return new Injection(
            descriptor.injectorId(),
            descriptor.finderId(),
            cloneProgram(rawResult.mutatedProgram()),
            valueOrEmpty(rawResult.spriteName()),
            valueOrEmpty(rawResult.originalScriptId()),
            valueOrEmpty(rawResult.mutatedScriptId()),
            valueOrEmpty(rawResult.originalScriptScratchBlocks()),
            valueOrEmpty(rawResult.mutatedScriptScratchBlocks())
        );
    }

    private InjectorOutcome failedOutcome(
        final SupportedInjector descriptor,
        final FailureCode failureCode
    ) {
        return new InjectorOutcome(
            descriptor.injectorId(),
            descriptor.finderId(),
            List.of(),
            new Failure(descriptor.injectorId(), descriptor.finderId(), failureCode)
        );
    }

    private Program cloneProgram(final Program program) {
        final Program clone = new CloneVisitor().apply(program);
        clone.accept(new ParentVisitor());
        return clone;
    }

    private static String valueOrEmpty(final String value) {
        return value == null ? "" : value;
    }

    private static List<SupportedInjector> createCatalogue(final Map<String, BugInjector> injectors) {
        Objects.requireNonNull(injectors, "injectors must not be null");
        return injectors.entrySet().stream()
            .map(entry -> new SupportedInjector(entry.getKey(), finderId(entry.getValue())))
            .sorted(Comparator.comparing(SupportedInjector::injectorId))
            .toList();
    }

    private static String finderId(final BugInjector injector) {
        Objects.requireNonNull(injector, "injector must not be null");
        if (
            injector.getIssueFinder() == null || injector.getIssueFinder().getName() == null
                || injector.getIssueFinder().getName().isBlank()
        ) {
            throw new IllegalArgumentException("Injector finder id must not be blank");
        }
        return injector.getIssueFinder().getName();
    }

    private static Map<String, SupportedInjector> indexCatalogue(final List<SupportedInjector> catalogue) {
        final Map<String, SupportedInjector> result = new LinkedHashMap<>();
        for (SupportedInjector descriptor : catalogue) {
            if (result.put(descriptor.injectorId(), descriptor) != null) {
                throw new IllegalArgumentException("Duplicate injector id");
            }
        }
        return Map.copyOf(result);
    }

    /** Public identifier pair for an injector supported by this service. */
    public record SupportedInjector(String injectorId, String finderId) {

        public SupportedInjector {
            if (injectorId == null || injectorId.isBlank()) {
                throw new IllegalArgumentException("Injector id must not be blank");
            }
            if (finderId == null || finderId.isBlank()) {
                throw new IllegalArgumentException("Finder id must not be blank");
            }
        }
    }

    /** One independent mutated program and its stable injection metadata. */
    public record Injection(
        String injectorId,
        String finderId,
        Program mutatedProgram,
        String spriteName,
        String originalScriptId,
        String mutatedScriptId,
        String originalScriptScratchBlocks,
        String mutatedScriptScratchBlocks
    ) {

        public Injection {
            Objects.requireNonNull(injectorId, "injector id must not be null");
            Objects.requireNonNull(finderId, "finder id must not be null");
            Objects.requireNonNull(mutatedProgram, "mutated program must not be null");
            spriteName = valueOrEmpty(spriteName);
            originalScriptId = valueOrEmpty(originalScriptId);
            mutatedScriptId = valueOrEmpty(mutatedScriptId);
            originalScriptScratchBlocks = valueOrEmpty(originalScriptScratchBlocks);
            mutatedScriptScratchBlocks = valueOrEmpty(mutatedScriptScratchBlocks);
        }
    }

    /** Result of running one requested injector, including a no-applicable-result outcome. */
    public record InjectorOutcome(
        String injectorId,
        String finderId,
        List<Injection> results,
        Failure failure
    ) {

        public InjectorOutcome {
            Objects.requireNonNull(injectorId, "injector id must not be null");
            Objects.requireNonNull(finderId, "finder id must not be null");
            results = List.copyOf(results);
            if (failure != null && !injectorId.equals(failure.injectorId())) {
                throw new IllegalArgumentException("Failure injector id does not match outcome");
            }
        }
    }

    /** Immutable batch response for one program-level request. */
    public record Response(List<InjectorOutcome> outcomes) {

        public Response {
            outcomes = List.copyOf(outcomes);
        }

        public List<Injection> results() {
            return outcomes.stream().flatMap(outcome -> outcome.results().stream()).toList();
        }
    }

    /** Explicit, bounded failure classification for a selected injector. */
    public record Failure(String injectorId, String finderId, FailureCode code) {

        public Failure {
            Objects.requireNonNull(injectorId, "injector id must not be null");
            Objects.requireNonNull(finderId, "finder id must not be null");
            Objects.requireNonNull(code, "failure code must not be null");
        }
    }

    /** Stable failure categories exposed by the service. */
    public enum FailureCode {
        INJECTOR_UNAVAILABLE,
        INJECTOR_FAILED
    }
}
