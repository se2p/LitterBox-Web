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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.Serial;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.jsoncreation.JSONStringCreator;
import de.uni_passau.fim.se2.litterbox_web.capabilities.AdvancedCapabilitiesConfiguration;
import de.uni_passau.fim.se2.litterbox_web.capabilities.AdvancedCapabilityDtos;
import de.uni_passau.fim.se2.litterbox_web.capabilities.AstNodes;
import de.uni_passau.fim.se2.litterbox_web.capabilities.CapabilityContent;
import de.uni_passau.fim.se2.litterbox_web.capabilities.CapabilityException;
import de.uni_passau.fim.se2.litterbox_web.capabilities.FaultInjectionCapability;
import de.uni_passau.fim.se2.litterbox_web.catalogue.PatternCatalogueEntry;
import de.uni_passau.fim.se2.litterbox_web.catalogue.PatternCatalogueService;
import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.persistence.DatabaseCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;
import reactor.core.publisher.SignalType;

/** Token-authorized, bounded mutation preview and derived archive generation. */
@Service
final class FaultInjectionCapabilityService implements FaultInjectionCapability {

    private static final long ABSOLUTE_MAX_INPUT_BYTES = 50L * 1024 * 1024;
    private static final int ABSOLUTE_MAX_AST_NODES = 200_000;
    private static final int ABSOLUTE_MAX_SELECTED_INJECTORS = 8;
    private static final int ABSOLUTE_MAX_MUTATION_RESULTS = 200;
    private static final int ABSOLUTE_MAX_ARCHIVE_ENTRIES = 2_000;
    private static final long ABSOLUTE_MAX_ARCHIVE_BYTES = 100L * 1024 * 1024;
    private static final long ABSOLUTE_MAX_UNCOMPRESSED_BYTES = 100L * 1024 * 1024;
    private static final long ABSOLUTE_MAX_ARCHIVE_ENTRY_BYTES = 25L * 1024 * 1024;
    private static final Duration ABSOLUTE_TIMEOUT = Duration.ofSeconds(30);
    private static final int SHA256_BYTES = 32;
    private static final int MAX_METADATA_BYTES = 1024 * 1024;
    private static final String RETAINED_PROGRAM_NAME = "retained-project";
    /** The bundle of every mutation is a plain archive of projects, not a project itself. */
    private static final String BUNDLE_FORMAT = "zip";
    private static final String SUCCESS = "success";
    private static final String FAILURE = "failure";
    private static final String UNKNOWN = "unknown";
    private static final String INJECTOR_TAG = "injector";
    private static final String INVALID = "invalid";
    private static final String OPERATION_TAG = "operation";
    private static final String INVALID_INJECTOR_SELECTION = "Injector selection is invalid";
    private static final Set<String> SUPPORTED_SOURCE_FORMATS = Set.of(".sb3", ".mblock");
    /** The built-in catalogue, in canonical order and keyed by the id every request names it with. */
    private static final Map<String, InjectionService.SupportedInjector> INJECTOR_BY_ID = indexInjectors();
    private static final Set<String> REJECTION_OUTCOMES = Set.of(
        "limit", "unavailable", "invalid_request", "not_found", "not_ready", "unsupported_source",
        "no_applicable"
    );

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final AdvancedCapabilitiesConfiguration configuration;
    private final MeterRegistry meterRegistry;
    private final InjectionService injectionService;
    private final PatternCatalogueService catalogueService;

    @Autowired
    FaultInjectionCapabilityService(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final AdvancedCapabilitiesConfiguration configuration,
        final MeterRegistry meterRegistry
    ) {
        this(
            submissions, analyses, sourceArtifacts, analysisWork, parser, configuration, meterRegistry,
            new InjectionService(), new PatternCatalogueService()
        );
    }

    FaultInjectionCapabilityService(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final AdvancedCapabilitiesConfiguration configuration,
        final MeterRegistry meterRegistry,
        final InjectionService injectionService,
        final PatternCatalogueService catalogueService
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.analysisWork = Objects.requireNonNull(analysisWork, "analysisWork");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.meterRegistry = Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.injectionService = Objects.requireNonNull(injectionService, "injectionService");
        this.catalogueService = Objects.requireNonNull(catalogueService, "catalogueService");
    }

    @Override
    public Mono<List<AdvancedCapabilityDtos.InjectorView>> injectors(
        final String submissionToken,
        final long analysisId,
        final String locale
    ) {
        return Mono.defer(
            () -> instrumented("list", "catalogue", tags -> injectorsWork(submissionToken, analysisId, locale, tags))
        );
    }

    private Mono<List<AdvancedCapabilityDtos.InjectorView>> injectorsWork(
        final String submissionToken,
        final long analysisId,
        final String locale,
        final OperationTags tags
    ) {
        return authorize(submissionToken, analysisId)
            .doOnNext(source -> tags.sourceFormat(source.format()))
            .flatMap(source -> analysisWork.submit(() -> injectorViews(locale)));
    }

    @Override
    public Mono<AdvancedCapabilityDtos.InjectorCatalogueView> injectorCatalogue(
        final String submissionToken,
        final long analysisId,
        final String locale
    ) {
        return injectors(submissionToken, analysisId, locale).map(
            injectors -> new AdvancedCapabilityDtos.InjectorCatalogueView(
                injectors, maxSelectedInjectors(), true
            )
        );
    }

    @Override
    public Mono<AdvancedCapabilityDtos.InjectionPreview> preview(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionRequest request
    ) {
        return Mono.defer(
            () -> instrumented(
                "preview", metricInjector(request), tags -> previewWork(submissionToken, analysisId, request, tags)
            )
        );
    }

    private Mono<AdvancedCapabilityDtos.InjectionPreview> previewWork(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionRequest request,
        final OperationTags tags
    ) {
        return Mono.fromCallable(() -> validateSelection(request))
            .doOnNext(selected -> tags.injector(selected.all() ? "all" : metricInjector(selected.ids())))
            .flatMap(
                selected -> authorize(submissionToken, analysisId)
                    .doOnNext(source -> tags.sourceFormat(source.format()))
                    .flatMap(source -> openAndRun(source, stream -> createPreview(source, selected, stream)))
            );
    }

    @Override
    public Mono<CapabilityContent> download(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionDownloadRequest request
    ) {
        return Mono.defer(
            () -> instrumented(
                "download", metricInjector(request), tags -> downloadWork(submissionToken, analysisId, request, tags)
            )
        );
    }

    private Mono<CapabilityContent> downloadWork(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionDownloadRequest request,
        final OperationTags tags
    ) {
        return Mono.fromCallable(() -> validateDownload(request))
            .flatMap(
                selected -> authorize(submissionToken, analysisId)
                    .doOnNext(source -> tags.sourceFormat(source.format()))
                    .flatMap(
                        source -> openAndRun(
                            source,
                            stream -> createDownload(source, selected.injectorId(), selected.resultIndex(), stream)
                        )
                    )
            );
    }

    @Override
    public Mono<CapabilityContent> downloadAll(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionRequest request
    ) {
        return Mono.defer(
            () -> instrumented(
                "download_all", metricInjector(request),
                tags -> downloadAllWork(submissionToken, analysisId, request, tags)
            )
        );
    }

    private Mono<CapabilityContent> downloadAllWork(
        final String submissionToken,
        final long analysisId,
        final AdvancedCapabilityDtos.InjectionRequest request,
        final OperationTags tags
    ) {
        return Mono.fromCallable(() -> validateSelection(request))
            .doOnNext(selected -> tags.injector(selected.all() ? "all" : metricInjector(selected.ids())))
            .flatMap(
                selected -> authorize(submissionToken, analysisId)
                    .doOnNext(source -> tags.sourceFormat(source.format()))
                    .flatMap(source -> openAndRun(source, stream -> createBundle(source, selected, stream)))
            );
    }

    /**
     * The scaffolding every operation shares: a disabled capability refuses before any work, the operation is bounded
     * by the configured timeout, its failures are mapped to the stable capability errors, and one outcome is recorded
     * whichever way it ends, cancellation included.
     */
    private <T> Mono<T> instrumented(
        final String operation,
        final String injector,
        final Function<OperationTags, Mono<T>> work
    ) {
        final OperationTags tags = new OperationTags(injector);
        final AtomicReference<String> outcome = new AtomicReference<>(FAILURE);
        final Timer.Sample timer = Timer.start(meterRegistry);
        final Mono<T> instrumented;
        if (!limits().isEnabled()) {
            instrumented = Mono.<T>error(CapabilityException.disabled())
                .doOnError(error -> outcome.set(outcome(error)));
        }
        else {
            instrumented = work.apply(tags)
                .timeout(injectionTimeout())
                .onErrorMap(this::mapFailure)
                .doOnSuccess(ignored -> outcome.set(SUCCESS))
                .doOnError(error -> outcome.set(outcome(error)));
        }
        return instrumented.doFinally(
            signal -> recordMetrics(
                timer, operation, tags.injector(), tags.sourceFormat(), outcome.get(),
                signal == SignalType.CANCEL
            )
        );
    }

    private Mono<AuthorizedSource> authorize(final String token, final long analysisId) {
        if (token == null || token.isBlank() || token.length() > 128 || analysisId < 1) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return nonNull(submissions.findByToken(token))
            .filter(this::isRetainedSubmission)
            .flatMap(
                owner -> nonNull(analyses.findById(analysisId))
                    .flatMap(analysis -> authorizeAnalysis(owner, analysis))
            )
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()));
    }

    private Mono<AuthorizedSource> authorizeAnalysis(final Submission owner, final Analysis analysis) {
        if (analysis.submissionId() != owner.id()) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        if (!isCompleted(analysis.status())) {
            return Mono.error(CapabilityException.analysisNotReady());
        }
        final String format = normalizedSourceFormat(analysis.inputFormat());
        if (!SUPPORTED_SOURCE_FORMATS.contains(format)) {
            return Mono.error(CapabilityException.unsupportedSourceFormat());
        }
        if (analysis.sourceArtifactId() < 1) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        return nonNull(sourceArtifacts.findById(analysis.sourceArtifactId()))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(artifact -> authorizeArtifact(analysis, artifact, format));
    }

    private Mono<AuthorizedSource> authorizeArtifact(
        final Analysis analysis,
        final SourceArtifact artifact,
        final String format
    ) {
        if (artifact.byteSize() < 0) {
            return Mono.error(CapabilityException.analysisNotFound());
        }
        if (artifact.byteSize() > maxInputBytes()) {
            return Mono.error(CapabilityException.limitExceeded());
        }
        return nonNull(sourceArtifacts.findMetadataById(artifact.id()))
            .flatMap(metadata -> analysisWork.submit(() -> metadataMatches(artifact, metadata)))
            .filter(Boolean.TRUE::equals)
            .filter(ignored -> artifactMatchesAnalysis(analysis, artifact))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .map(ignored -> new AuthorizedSource(analysis, artifact, format));
    }

    private <T> Mono<T> openAndRun(
        final AuthorizedSource source,
        final ArchiveOperation<T> operation
    ) {
        if (!validSource(source)) {
            return Mono.error(
                source.artifact().byteSize() > maxInputBytes()
                    ? CapabilityException.limitExceeded()
                    : CapabilityException.analysisNotFound()
            );
        }
        // The stream is opened by the publisher below and owned by Mono.using from the moment the work subscribes.
        // Between those two there is a moment that belongs to neither: the timeout bounding this operation cancels
        // from outside and can land in it, and what it leaves behind is an open stream nothing holds. Reactor hands
        // a value dropped that way to the discard handler, which is the only place left to close it.
        return nonNull(sourceArtifacts.open(source.artifact().sha256()))
            .switchIfEmpty(Mono.error(CapabilityException.analysisNotFound()))
            .flatMap(
                stream -> Mono.using(
                    () -> stream,
                    owned -> analysisWork.submit(() -> operation.apply(owned)),
                    this::closeQuietly
                )
            )
            .doOnDiscard(InputStream.class, this::closeQuietly);
    }

    private boolean validSource(final AuthorizedSource source) {
        if (source.artifact().byteSize() < 0 || source.artifact().byteSize() > maxInputBytes()) {
            return false;
        }
        if (!validDigest(source.analysis().inputSha256()) || !validDigest(source.artifact().sha256())) {
            return false;
        }
        return MessageDigest.isEqual(source.analysis().inputSha256(), source.artifact().sha256());
    }

    private AdvancedCapabilityDtos.InjectionPreview createPreview(
        final AuthorizedSource source,
        final InjectorSelection selected,
        final InputStream stream
    ) throws IOException {
        final byte[] archive = readAndVerify(source, stream);
        final InjectionArchiveCodec.ValidatedArchive validated = inspectArchive(archive);
        final Program program = parse(validated.projectJson());
        if (AstNodes.count(program, maxAstNodes()) > maxAstNodes()) {
            throw new InjectionLimitExceeded();
        }
        final InjectionService.Response response = inject(program, selected);
        return mapPreview(source.analysis(), response);
    }

    private CapabilityContent createDownload(
        final AuthorizedSource source,
        final String injectorId,
        final int resultIndex,
        final InputStream stream
    ) throws IOException {
        final byte[] archive = readAndVerify(source, stream);
        final InjectionArchiveCodec.ValidatedArchive validated = inspectArchive(archive);
        final Program program = parse(validated.projectJson());
        if (AstNodes.count(program, maxAstNodes()) > maxAstNodes()) {
            throw new InjectionLimitExceeded();
        }
        final InjectionService.Response response = inject(program, new InjectorSelection(List.of(injectorId), false));
        final InjectionService.InjectorOutcome outcome = response.outcomes().stream()
            .filter(candidate -> injectorId.equals(candidate.injectorId()))
            .findFirst()
            .orElseThrow(NoApplicableMutation::new);
        if (
            outcome.failure() != null || outcome.results().size() > maxMutationResults()
                || resultIndex >= outcome.results().size()
        ) {
            throw new NoApplicableMutation();
        }
        final InjectionService.Injection mutation = outcome.results().get(resultIndex);
        final byte[] mutatedProject = jsonBytes(mutation.mutatedProgram());
        try {
            parser.parseFromString(RETAINED_PROGRAM_NAME, new String(mutatedProject, StandardCharsets.UTF_8));
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new ArchiveMalformed();
        }
        final byte[] derived;
        try {
            derived = InjectionArchiveCodec.reconstruct(validated, mutatedProject, archiveLimits());
        }
        catch (IOException exception) {
            throw new ArchiveMalformed();
        }
        if (derived.length > maxArchiveBytes()) {
            throw new InjectionLimitExceeded();
        }
        return new CapabilityContent(derived, source.format().substring(1));
    }

    /** The project is read, parsed and injected once however many mutations come out; only reconstruction repeats. */
    private CapabilityContent createBundle(
        final AuthorizedSource source,
        final InjectorSelection selected,
        final InputStream stream
    ) throws IOException {
        final byte[] archive = readAndVerify(source, stream);
        final InjectionArchiveCodec.ValidatedArchive validated = inspectArchive(archive);
        final Program program = parse(validated.projectJson());
        if (AstNodes.count(program, maxAstNodes()) > maxAstNodes()) {
            throw new InjectionLimitExceeded();
        }
        final InjectionService.Response response = inject(program, selected);
        final Map<String, byte[]> members = bundleMembers(source, validated, response);
        if (members.isEmpty()) {
            throw new NoApplicableMutation();
        }
        final byte[] bundled;
        try {
            bundled = InjectionArchiveCodec.bundle(members, archiveLimits());
        }
        catch (InjectionArchiveCodec.ArchiveLimitExceeded exception) {
            throw new InjectionLimitExceeded();
        }
        catch (IOException | InjectionArchiveCodec.ArchiveMalformed exception) {
            throw new ArchiveMalformed();
        }
        if (bundled.length > maxArchiveBytes()) {
            throw new InjectionLimitExceeded();
        }
        return new CapabilityContent(bundled, BUNDLE_FORMAT);
    }

    private Map<String, byte[]> bundleMembers(
        final AuthorizedSource source,
        final InjectionArchiveCodec.ValidatedArchive validated,
        final InjectionService.Response response
    ) {
        final Map<String, byte[]> members = new java.util.LinkedHashMap<>();
        for (InjectionService.InjectorOutcome outcome : response.outcomes()) {
            addBundleMembers(source, validated, outcome, members);
        }
        return members;
    }

    private void addBundleMembers(
        final AuthorizedSource source,
        final InjectionArchiveCodec.ValidatedArchive validated,
        final InjectionService.InjectorOutcome outcome,
        final Map<String, byte[]> members
    ) {
        if (outcome.failure() != null) {
            return;
        }
        final List<InjectionService.Injection> mutations = outcome.results();
        if (members.size() + mutations.size() > maxMutationResults()) {
            throw new InjectionLimitExceeded();
        }
        for (int index = 0; index < mutations.size(); index++) {
            members.put(
                memberName(outcome.injectorId(), index, source.format()),
                derivedProject(validated, mutations.get(index))
            );
        }
    }

    private byte[] derivedProject(
        final InjectionArchiveCodec.ValidatedArchive validated,
        final InjectionService.Injection mutation
    ) {
        final byte[] mutatedProject = jsonBytes(mutation.mutatedProgram());
        try {
            parser.parseFromString(RETAINED_PROGRAM_NAME, new String(mutatedProject, StandardCharsets.UTF_8));
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new ArchiveMalformed();
        }
        try {
            return InjectionArchiveCodec.reconstruct(validated, mutatedProject, archiveLimits());
        }
        catch (IOException exception) {
            throw new ArchiveMalformed();
        }
    }

    /**
     * A member is named for the injector that produced it and its place among that injector's results, so a reader
     * unpacking the archive can tell which fault is in which file. Anything an injector id might carry that a file name
     * should not is replaced rather than trusted.
     */
    private String memberName(final String injectorId, final int index, final String format) {
        final StringBuilder safe = new StringBuilder(injectorId.length());
        for (int position = 0; position < injectorId.length() && safe.length() < 64; position++) {
            final char character = injectorId.charAt(position);
            safe.append(memberCharacter(character));
        }
        final String stem = safe.isEmpty() ? INJECTOR_TAG : safe.toString();
        return String.format(Locale.ROOT, "%s-%d%s", stem, index + 1, format);
    }

    private char memberCharacter(final char character) {
        if (character >= 'a' && character <= 'z') {
            return character;
        }
        if (character >= 'A' && character <= 'Z') {
            return character;
        }
        if (character >= '0' && character <= '9') {
            return character;
        }
        return character == '-' || character == '_' ? character : '_';
    }

    private InjectionArchiveCodec.ValidatedArchive inspectArchive(final byte[] archive) throws IOException {
        try {
            return InjectionArchiveCodec.inspect(archive, archiveLimits());
        }
        catch (InjectionArchiveCodec.ArchiveLimitExceeded exception) {
            throw new InjectionLimitExceeded();
        }
        catch (InjectionArchiveCodec.ArchiveMalformed exception) {
            throw new ArchiveMalformed();
        }
        catch (IOException exception) {
            throw new ArchiveMalformed();
        }
    }

    private Program parse(final byte[] projectJson) {
        try {
            return parser.parseFromString(RETAINED_PROGRAM_NAME, new String(projectJson, StandardCharsets.UTF_8));
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new ArchiveMalformed();
        }
    }

    private InjectionService.Response inject(final Program program, final InjectorSelection selected) {
        try {
            return selected.all()
                ? injectionService.inject(program)
                : injectionService.inject(program, selected.ids());
        }
        catch (RuntimeException exception) {
            throw new CoreInjectionFailure();
        }
    }

    private AdvancedCapabilityDtos.InjectionPreview mapPreview(
        final Analysis analysis,
        final InjectionService.Response response
    ) {
        int resultCount = 0;
        final List<AdvancedCapabilityDtos.InjectionResultView> results = new ArrayList<>();
        final List<AdvancedCapabilityDtos.InjectionFailureView> failures = new ArrayList<>();
        for (InjectionService.InjectorOutcome outcome : response.outcomes()) {
            final List<InjectionService.Injection> mutations = outcome.results();
            if (mutations.isEmpty()) {
                failures.add(
                    new AdvancedCapabilityDtos.InjectionFailureView(
                        outcome.injectorId(), outcome.finderId(), failureCode(outcome)
                    )
                );
                continue;
            }
            if (mutations.size() > maxMutationResults() - resultCount) {
                throw new InjectionLimitExceeded();
            }
            for (int index = 0; index < mutations.size(); index++) {
                final InjectionService.Injection mutation = mutations.get(index);
                results.add(
                    new AdvancedCapabilityDtos.InjectionResultView(
                        mutation.injectorId(), mutation.finderId(), index, value(mutation.spriteName()),
                        value(mutation.originalScriptId()), value(mutation.mutatedScriptId()),
                        value(mutation.originalScriptScratchBlocks()), value(mutation.mutatedScriptScratchBlocks())
                    )
                );
                resultCount++;
            }
        }
        return new AdvancedCapabilityDtos.InjectionPreview(
            AdvancedCapabilityDtos.SCHEMA_VERSION,
            new AdvancedCapabilityDtos.SourceView(analysis.id(), sourceName(analysis)),
            results,
            failures
        );
    }

    private String failureCode(final InjectionService.InjectorOutcome outcome) {
        if (outcome.failure() == null) {
            return "no_applicable_mutation";
        }
        return switch (outcome.failure().code().name()) {
            case "INJECTOR_UNAVAILABLE" -> "injector_unavailable";
            case "INJECTOR_FAILED" -> "injector_failed";
            default -> "injector_failed";
        };
    }

    private byte[] jsonBytes(final Program program) {
        try {
            final byte[] bytes = JSONStringCreator.createProgramJSONString(program).getBytes(StandardCharsets.UTF_8);
            if (bytes.length > maxArchiveEntryBytes()) {
                throw new InjectionLimitExceeded();
            }
            return bytes;
        }
        catch (InjectionLimitExceeded exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw new ArchiveMalformed();
        }
    }

    private List<AdvancedCapabilityDtos.InjectorView> injectorViews(final String locale) {
        final Locale requested = locale(locale);
        final List<AdvancedCapabilityDtos.InjectorView> views = new ArrayList<>(INJECTOR_BY_ID.size());
        for (InjectionService.SupportedInjector injector : INJECTOR_BY_ID.values()) {
            final PatternCatalogueEntry entry = catalogueService.entry(injector.finderId(), requested);
            views.add(
                new AdvancedCapabilityDtos.InjectorView(
                    injector.injectorId(), injector.finderId(), value(entry.name()), value(entry.hint())
                )
            );
        }
        return List.copyOf(views);
    }

    private InjectorSelection validateSelection(final AdvancedCapabilityDtos.InjectionRequest request) {
        if (request == null || request.injectorIds() == null) {
            throw new InvalidInjectionRequest("Select at least one injector");
        }
        if (request.selectsAll()) {
            if (!request.injectorIds().isEmpty()) {
                throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
            }
            return new InjectorSelection(List.copyOf(INJECTOR_BY_ID.keySet()), true);
        }
        if (request.injectorIds().isEmpty()) {
            throw new InvalidInjectionRequest("Select at least one injector");
        }
        if (request.injectorIds().size() > maxSelectedInjectors()) {
            throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
        }
        final List<String> selected = new ArrayList<>(request.injectorIds().size());
        for (String id : request.injectorIds()) {
            validateSelectedId(id);
            if (selected.contains(id)) {
                throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
            }
            selected.add(id);
        }
        return new InjectorSelection(selected, false);
    }

    private void validateSelectedId(final String id) {
        if (id == null || id.isBlank() || id.length() > 128) {
            throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
        }
        if (!INJECTOR_BY_ID.containsKey(id)) {
            throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
        }
    }

    private DownloadSelection validateDownload(final AdvancedCapabilityDtos.InjectionDownloadRequest request) {
        if (!validDownloadRequest(request)) {
            throw new InvalidInjectionRequest(INVALID_INJECTOR_SELECTION);
        }
        if (request.resultIndex() < 0 || request.resultIndex() >= maxMutationResults()) {
            throw new NoApplicableMutation();
        }
        return new DownloadSelection(request.injectorId(), request.resultIndex());
    }

    private boolean validDownloadRequest(final AdvancedCapabilityDtos.InjectionDownloadRequest request) {
        if (request == null || request.injectorId() == null || request.injectorId().isBlank()) {
            return false;
        }
        if (request.injectorId().length() > 128) {
            return false;
        }
        return INJECTOR_BY_ID.containsKey(request.injectorId());
    }

    private String metricInjector(final AdvancedCapabilityDtos.InjectionRequest request) {
        if (request == null || request.injectorIds() == null) {
            return INVALID;
        }
        if (request.selectsAll()) {
            return request.injectorIds().isEmpty() ? "all" : INVALID;
        }
        return metricInjector(request.injectorIds());
    }

    private String metricInjector(final AdvancedCapabilityDtos.InjectionDownloadRequest request) {
        if (request == null || request.injectorId() == null || !INJECTOR_BY_ID.containsKey(request.injectorId())) {
            return INVALID;
        }
        return request.injectorId();
    }

    private String metricInjector(final List<String> selected) {
        if (selected == null || selected.isEmpty()) {
            return INVALID;
        }
        if (selected.size() == 1 && INJECTOR_BY_ID.containsKey(selected.getFirst())) {
            return selected.getFirst();
        }
        return selected.stream().allMatch(INJECTOR_BY_ID::containsKey) ? "multiple" : INVALID;
    }

    private AdvancedCapabilitiesConfiguration.InjectionLimits limits() {
        return configuration.getFaultInjection();
    }

    private InjectionArchiveCodec.Limits archiveLimits() {
        return new InjectionArchiveCodec.Limits(
            maxArchiveEntries(), maxArchiveBytes(), maxUncompressedBytes(), maxArchiveEntryBytes()
        );
    }

    private int maxSelectedInjectors() {
        return Math.clamp(limits().getMaxSelectedInjectors(), 1, ABSOLUTE_MAX_SELECTED_INJECTORS);
    }

    private int maxMutationResults() {
        return Math.clamp(limits().getMaxMutationResults(), 1, ABSOLUTE_MAX_MUTATION_RESULTS);
    }

    private long maxInputBytes() {
        return Math.clamp(limits().getMaxInputBytes(), 1L, ABSOLUTE_MAX_INPUT_BYTES);
    }

    private int maxAstNodes() {
        return Math.clamp(limits().getMaxAstNodes(), 1, ABSOLUTE_MAX_AST_NODES);
    }

    private int maxArchiveEntries() {
        return Math.clamp(limits().getMaxArchiveEntries(), 1, ABSOLUTE_MAX_ARCHIVE_ENTRIES);
    }

    private long maxArchiveBytes() {
        return Math.clamp(limits().getMaxArchiveBytes(), 1L, ABSOLUTE_MAX_ARCHIVE_BYTES);
    }

    private long maxUncompressedBytes() {
        return Math.clamp(limits().getMaxUncompressedBytes(), 1L, ABSOLUTE_MAX_UNCOMPRESSED_BYTES);
    }

    private long maxArchiveEntryBytes() {
        return Math.clamp(limits().getMaxArchiveEntryBytes(), 1L, ABSOLUTE_MAX_ARCHIVE_ENTRY_BYTES);
    }

    private Duration injectionTimeout() {
        final Duration configured = limits().getTimeout();
        return configured == null || configured.compareTo(ABSOLUTE_TIMEOUT) > 0 ? ABSOLUTE_TIMEOUT : configured;
    }

    private byte[] readAndVerify(final AuthorizedSource source, final InputStream stream) throws IOException {
        final long limit = maxInputBytes();
        final ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(limit, 8192));
        final MessageDigest digest = sha256();
        final byte[] buffer = new byte[8192];
        long size = 0;
        int read;
        while ((read = stream.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            if (size > limit - read) {
                throw new InjectionLimitExceeded();
            }
            size += read;
            digest.update(buffer, 0, read);
            output.write(buffer, 0, read);
        }
        if (
            size != source.artifact().byteSize()
                || !MessageDigest.isEqual(digest.digest(), source.artifact().sha256())
                || !MessageDigest.isEqual(source.analysis().inputSha256(), source.artifact().sha256())
        ) {
            throw new ArtifactIntegrityFailure();
        }
        return output.toByteArray();
    }

    private boolean metadataMatches(final SourceArtifact artifact, final SourceArtifactMetadata metadata) {
        if (
            metadata == null || metadata.artifactId() != artifact.id() || metadata.sourceKind() == null
                || metadata.sourceKind().isBlank()
        ) {
            return false;
        }
        final String manifest = metadata.manifestJson();
        if (manifest == null || manifest.isBlank()) {
            return true;
        }
        if (manifest.getBytes(StandardCharsets.UTF_8).length > MAX_METADATA_BYTES) {
            return false;
        }
        try {
            final tools.jackson.databind.JsonNode root = tools.jackson.databind.json.JsonMapper.shared()
                .readTree(manifest);
            return root != null && root.isObject();
        }
        catch (RuntimeException | StackOverflowError exception) {
            return false;
        }
    }

    private boolean validDigest(final byte[] digest) {
        return digest != null && digest.length == SHA256_BYTES;
    }

    private boolean artifactMatchesAnalysis(final Analysis analysis, final SourceArtifact artifact) {
        return validDigest(analysis.inputSha256()) && validDigest(artifact.sha256())
            && MessageDigest.isEqual(analysis.inputSha256(), artifact.sha256());
    }

    private boolean isCompleted(final String status) {
        return "DONE".equals(status) || "COMPLETED".equals(status);
    }

    private boolean isRetainedSubmission(final Submission submission) {
        return submission != null && "ACTIVE".equalsIgnoreCase(submission.retentionState());
    }

    private String normalizedSourceFormat(final String format) {
        if (format == null) {
            return "";
        }
        final String normalized = format.toLowerCase(Locale.ROOT);
        return normalized.startsWith(".") ? normalized : "." + normalized;
    }

    private Locale locale(final String language) {
        if (language == null) {
            throw new InvalidInjectionRequest("Unsupported locale");
        }
        return switch (language) {
            case "de" -> Locale.GERMAN;
            case "en" -> Locale.ENGLISH;
            case "es" -> Locale.of("es");
            case "nl" -> Locale.of("nl");
            default -> throw new InvalidInjectionRequest("Unsupported locale");
        };
    }

    private String sourceName(final Analysis analysis) {
        final String name = analysis.projectName();
        if (name == null || name.isBlank()) {
            return RETAINED_PROGRAM_NAME;
        }
        final StringBuilder safe = new StringBuilder(Math.min(name.length(), 255));
        for (int index = 0; index < name.length() && safe.length() < 255; index++) {
            final char character = name.charAt(index);
            safe.append(
                character == '/' || character == '\\' || Character.isISOControl(character) ? '_' : character
            );
        }
        return safe.isEmpty() ? RETAINED_PROGRAM_NAME : safe.toString();
    }

    private String value(final String value) {
        return value == null ? "" : value;
    }

    private void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // Cleanup must not replace the stable capability response.
        }
    }

    private Throwable mapFailure(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException || cause instanceof InvalidInjectionRequest) {
            return cause;
        }
        if (cause instanceof TimeoutException) {
            return CapabilityException.timedOut();
        }
        if (isUnavailable(cause)) {
            return CapabilityException.unavailable();
        }
        if (isLimitExceeded(cause)) {
            return CapabilityException.limitExceeded();
        }
        if (isMissingArtifact(cause)) {
            return CapabilityException.analysisNotFound();
        }
        if (isUnsupported(cause)) {
            return CapabilityException.unsupportedSourceFormat();
        }
        if (cause instanceof NoApplicableMutation) {
            return CapabilityException.noApplicableMutation();
        }
        return CapabilityException.unsupportedSourceFormat();
    }

    private boolean isUnavailable(final Throwable cause) {
        return cause instanceof AnalysisCapacityExceededException
            || cause instanceof DatabaseCapacityExceededException
            || cause instanceof RejectedExecutionException;
    }

    private boolean isLimitExceeded(final Throwable cause) {
        return cause instanceof InjectionLimitExceeded
            || cause instanceof InjectionArchiveCodec.ArchiveLimitExceeded;
    }

    private boolean isMissingArtifact(final Throwable cause) {
        return cause instanceof ArtifactIntegrityFailure || cause instanceof IOException;
    }

    private boolean isUnsupported(final Throwable cause) {
        return cause instanceof ArchiveMalformed || cause instanceof CoreInjectionFailure;
    }

    private String outcome(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof CapabilityException capability) {
            return capabilityOutcome(capability);
        }
        if (cause instanceof InvalidInjectionRequest) {
            return "invalid_request";
        }
        return FAILURE;
    }

    private String capabilityOutcome(final CapabilityException capability) {
        return switch (capability.code()) {
            case "capability_timeout" -> "timeout";
            case "capability_limit_exceeded" -> "limit";
            case "capability_unavailable" -> "unavailable";
            case "analysis_not_found" -> "not_found";
            case "analysis_not_ready" -> "not_ready";
            case "unsupported_source_format" -> "unsupported_source";
            case "no_applicable_mutation" -> "no_applicable";
            case "capability_disabled" -> "disabled";
            default -> FAILURE;
        };
    }

    private void recordMetrics(
        final Timer.Sample timer,
        final String operation,
        final String injector,
        final String sourceFormat,
        final String result,
        final boolean cancelled
    ) {
        final String metricOutcome = cancelled ? "cancelled" : boundedOutcome(result);
        final String boundedInjector = INJECTOR_BY_ID.containsKey(injector)
            || Set.of("catalogue", "multiple", INVALID)
                .contains(injector) ? injector : INVALID;
        final String boundedFormat = SUPPORTED_SOURCE_FORMATS.contains(sourceFormat)
            ? sourceFormat.substring(1)
            : UNKNOWN;
        meterRegistry.counter(
            "litterbox.capabilities.injection.outcomes",
            OPERATION_TAG, operation,
            INJECTOR_TAG, boundedInjector,
            "source_format", boundedFormat,
            "outcome", metricOutcome
        ).increment();
        if ("timeout".equals(metricOutcome)) {
            meterRegistry.counter(
                "litterbox.capabilities.injection.timeouts", OPERATION_TAG, operation, INJECTOR_TAG, boundedInjector
            ).increment();
        }
        if ("cancelled".equals(metricOutcome)) {
            meterRegistry.counter(
                "litterbox.capabilities.injection.cancellations", OPERATION_TAG, operation, INJECTOR_TAG,
                boundedInjector
            ).increment();
        }
        if (REJECTION_OUTCOMES.contains(metricOutcome)) {
            meterRegistry.counter(
                "litterbox.capabilities.injection.rejections",
                OPERATION_TAG, operation,
                INJECTOR_TAG, boundedInjector,
                "reason", metricOutcome
            ).increment();
        }
        timer.stop(
            meterRegistry.timer(
                "litterbox.capabilities.injection.duration",
                Tags.of(
                    OPERATION_TAG, operation,
                    INJECTOR_TAG, boundedInjector,
                    "source_format", boundedFormat,
                    "outcome", metricOutcome
                )
            )
        );
    }

    private String boundedOutcome(final String result) {
        return Set.of(
            SUCCESS, "timeout", "cancelled", "limit", "unavailable", "not_found", "not_ready",
            "unsupported_source", "no_applicable", "invalid_request", "disabled", FAILURE
        ).contains(result) ? result : FAILURE;
    }

    private static Map<String, InjectionService.SupportedInjector> indexInjectors() {
        final Map<String, InjectionService.SupportedInjector> indexed = new java.util.LinkedHashMap<>();
        for (InjectionService.SupportedInjector injector : InjectionService.supportedInjectors()) {
            if (indexed.put(injector.injectorId(), injector) != null) {
                throw new IllegalStateException("Duplicate canonical injector id");
            }
        }
        return Collections.unmodifiableMap(indexed);
    }

    private static <T> Mono<T> nonNull(final Mono<T> mono) {
        return mono == null ? Mono.empty() : mono;
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record AuthorizedSource(Analysis analysis, SourceArtifact artifact, String format) {
    }

    private record DownloadSelection(String injectorId, int resultIndex) {
    }

    private record InjectorSelection(List<String> ids, boolean all) {

        private InjectorSelection {
            ids = List.copyOf(ids);
        }
    }

    /**
     * What an operation reports about itself once it finishes. Both tags start at what the request alone can say and
     * are corrected as the operation learns which injectors were really selected and which archive it really read.
     */
    private static final class OperationTags {

        private final AtomicReference<String> injector;
        private final AtomicReference<String> sourceFormat = new AtomicReference<>(UNKNOWN);

        private OperationTags(final String requested) {
            injector = new AtomicReference<>(requested);
        }

        private void injector(final String selected) {
            injector.set(selected);
        }

        private String injector() {
            return injector.get();
        }

        private void sourceFormat(final String format) {
            sourceFormat.set(format);
        }

        private String sourceFormat() {
            return sourceFormat.get();
        }
    }

    private static final class InvalidInjectionRequest extends IllegalArgumentException {

        @Serial
        private static final long serialVersionUID = 1L;

        private InvalidInjectionRequest(final String message) {
            super(message);
        }
    }

    private static final class ArtifactIntegrityFailure extends RuntimeException {

        @Serial
        private static final long serialVersionUID = 1L;
    }

    private static final class ArchiveMalformed extends RuntimeException {

        @Serial
        private static final long serialVersionUID = 1L;
    }

    private static final class InjectionLimitExceeded extends RuntimeException {

        @Serial
        private static final long serialVersionUID = 1L;
    }

    private static final class NoApplicableMutation extends RuntimeException {

        @Serial
        private static final long serialVersionUID = 1L;
    }

    private static final class CoreInjectionFailure extends RuntimeException {

        @Serial
        private static final long serialVersionUID = 1L;
    }

    @FunctionalInterface
    private interface ArchiveOperation<T> {

        T apply(InputStream stream) throws IOException;
    }
}
