/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiContext;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiContextAssembler;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiFollowUp;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPromptBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiRequest;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiRequestResolver;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiResponse;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiResponseParser;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiSelection;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetCatalogueBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.inquiry.ScratchInquiryAnalyzer;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversation;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.StartedTurn;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.TurnStart;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiMessage;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Signal;

/** Manages Ask AI conversations; provider calls are stateless apart from a prior answer used for follow-ups. */
@Service
public final class AskAiConversationService {

    private static final Set<String> ALLOWED_COMMON_SELECTORS = AskAiQuestionCatalogue.OFFERED_COMMON_QUERIES
        .stream().map(query -> "common:" + query.name()).collect(Collectors.toUnmodifiableSet());

    private static final String TURN_TIMER = "litterbox.ask.ai.turns";

    private static final String REFUSED_COUNTER = "litterbox.ask.ai.refused";

    private static final Logger log = LoggerFactory.getLogger(AskAiConversationService.class);
    private static final Pattern TARGET_KEY = Pattern.compile("target:v1-[A-Za-z0-9_-]{1,160}");
    private static final AskAiRequestResolver REQUEST_RESOLVER = new AskAiRequestResolver(
        new ScratchInquiryAnalyzer(), new ScratchTargetCatalogueBuilder()
    );
    private static final AskAiContextAssembler CONTEXT_ASSEMBLER = new AskAiContextAssembler();
    private static final AskAiResponseParser RESPONSE_PARSER = new AskAiResponseParser();

    private final AskAiProgramLoader loader;
    private final AskAiConversationRepository repository;
    private final AskAiProviderClient providerClient;
    private final AskAiAdmissionGate admissionGate;
    private final AskAiConfigurationProperties configuration;
    private final Clock clock;
    private final MeterRegistry metrics;

    @Autowired
    public AskAiConversationService(
        final AskAiProgramLoader loader,
        final AskAiConversationRepository repository,
        final AskAiProviderClient providerClient,
        final AskAiAdmissionGate admissionGate,
        final AskAiConfigurationProperties configuration,
        final MeterRegistry metrics
    ) {
        this(loader, repository, providerClient, admissionGate, configuration, Clock.systemUTC(), metrics);
    }

    AskAiConversationService(
        final AskAiProgramLoader loader,
        final AskAiConversationRepository repository,
        final AskAiProviderClient providerClient,
        final AskAiAdmissionGate admissionGate,
        final AskAiConfigurationProperties configuration,
        final Clock clock,
        final MeterRegistry metrics
    ) {
        this.loader = Objects.requireNonNull(loader, "loader");
        this.repository = Objects.requireNonNull(repository, "repository");
        this.providerClient = Objects.requireNonNull(providerClient, "providerClient");
        this.admissionGate = Objects.requireNonNull(admissionGate, "admissionGate");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    public Mono<AskAiConversationCreatedView> createConversation(
        final String submissionToken, final long analysisId, final String locale, final String scopeKind,
        final String scopeSelector
    ) {
        return resolveForCreation(submissionToken, analysisId, locale, scopeKind, scopeSelector)
            .flatMap(resolved -> admitAndPersist(resolved, locale, scopeKind, scopeSelector));
    }

    private Mono<ResolvedCreation> resolveForCreation(
        final String submissionToken, final long analysisId, final String locale, final String scopeKind,
        final String scopeSelector
    ) {
        return loader.authorize(submissionToken, analysisId)
            .flatMap(
                authorized -> requireValidCreateRequest(locale, scopeKind, scopeSelector)
                    .then(loader.loadProgram(authorized))
                    .flatMap(
                        program -> Mono.fromCallable(() -> resolveSelection(program, scopeKind, scopeSelector, locale))
                    )
                    .map(request -> new ResolvedCreation(authorized, request))
            )
            .onErrorMap(AskAiProgramLoader::mapContextFailure);
    }

    private Mono<Void> requireValidCreateRequest(
        final String locale, final String scopeKind, final String scopeSelector
    ) {
        final Mono<Void> localeValidation = AskAiQuestionCatalogue.requireSupportedLocale(locale);
        if (!validScope(scopeKind, scopeSelector)) {
            return localeValidation.then(Mono.error(new IllegalArgumentException("Unsupported or malformed scope")));
        }
        return localeValidation;
    }

    private AskAiRequest resolveSelection(
        final Program program, final String scopeKind, final String scopeSelector, final String locale
    ) {
        final AskAiSelection selection = buildSelection(scopeKind, scopeSelector, locale, null);
        try {
            return REQUEST_RESOLVER.resolve(program, selection);
        }
        catch (IllegalArgumentException stale) {
            throw AskAiProblemException.contextNotFound();
        }
    }

    private Mono<AskAiConversationCreatedView> admitAndPersist(
        final ResolvedCreation resolved, final String locale, final String scopeKind, final String scopeSelector
    ) {
        final String label = label(resolved.request(), locale);
        final Instant now = clock.instant();
        final AskAiConversationRepository.NewConversation newConversation = new AskAiConversationRepository.NewConversation(
            resolved.authorized().submission().id(), resolved.authorized().analysis().id(), locale, scopeKind,
            scopeSelector, label, now.plus(configuration.getConversation().getUserVisibleTtl()),
            now.plus(configuration.getConversation().getAnalysisRetainTtl())
        );
        return repository
            .createWithinCap(newConversation, configuration.getConversation().getMaxActivePerAnalysis(), now)
            .map(
                conversation -> new AskAiConversationCreatedView(
                    AskAiQuestionCatalogue.SCHEMA_VERSION, conversation.publicId(),
                    new AskAiScopeView(scopeKind, label),
                    configuration.getConversation().getMaxRepliesPerConversation()
                )
            )
            .switchIfEmpty(
                Mono.defer(() -> Mono.error(refuse("conversations", AskAiProblemException.quotaExhausted())))
            );
    }

    /**
     * Starts or replays one idempotent conversation turn.
     *
     * @param submissionToken      token proving access to the submission
     * @param analysisId           analysis whose conversation is addressed
     * @param conversationPublicId public conversation identifier
     * @param clientMessageId      client-generated idempotency key
     * @param action               either {@code ASK} or {@code FOLLOW_UP}
     * @param followUpName         requested follow-up when the action is {@code FOLLOW_UP}
     * @return the accepted, replayed, or generated message response
     */
    public Mono<AskAiMessageResponseView> postMessage(
        final String submissionToken, final long analysisId, final String conversationPublicId,
        final String clientMessageId, final String action, final String followUpName
    ) {
        return Mono.defer(() -> {
            final String followUp = validatedFollowUp(clientMessageId, action, followUpName);
            return resolveConversationContext(submissionToken, analysisId, conversationPublicId)
                .flatMap(context -> generateReply(context, clientMessageId, action, followUp));
        });
    }

    private String validatedFollowUp(
        final String clientMessageId, final String action, final String followUpName
    ) {
        if (clientMessageId == null || clientMessageId.isBlank() || clientMessageId.length() > 64) {
            throw new IllegalArgumentException("clientMessageId is required");
        }
        if (!"ASK".equals(action) && !"FOLLOW_UP".equals(action)) {
            throw new IllegalArgumentException("action must be ASK or FOLLOW_UP");
        }
        if ("ASK".equals(action)) {
            if (followUpName != null) {
                throw new IllegalArgumentException("ASK does not take a followUp");
            }
            return null;
        }
        try {
            return AskAiFollowUp.parse(followUpName).name();
        }
        catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("Unknown follow-up", invalid);
        }
    }

    private Mono<ConversationContext> resolveConversationContext(
        final String submissionToken, final long analysisId, final String conversationPublicId
    ) {
        return loader.authorize(submissionToken, analysisId)
            .flatMap(
                authorized -> repository.findVisible(
                    authorized.submission().id(), authorized.analysis().id(), conversationPublicId, clock.instant()
                )
                    .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()))
                    .map(conversation -> new ConversationContext(authorized, conversation))
            )
            .onErrorMap(AskAiProgramLoader::mapContextFailure);
    }

    private Mono<AskAiMessageResponseView> generateReply(
        final ConversationContext context, final String clientMessageId, final String action, final String followUpName
    ) {
        return answerAlreadySent(context.conversation(), clientMessageId, action, followUpName)
            .switchIfEmpty(Mono.defer(() -> beginTurn(context, clientMessageId, action, followUpName)));
    }

    /** Replays a settled send, or returns empty so the caller can reserve a new turn. */
    private Mono<AskAiMessageResponseView> answerAlreadySent(
        final AskAiConversation conversation, final String clientMessageId, final String action,
        final String followUpName
    ) {
        return repository.findByClientMessageId(conversation.id(), clientMessageId)
            .flatMap(existing -> replay(conversation, existing, action, followUpName));
    }

    private Mono<AskAiMessageResponseView> replay(
        final AskAiConversation conversation, final AskAiMessage existingUser, final String action,
        final String followUpName
    ) {
        if (!Objects.equals(existingUser.action(), action) || !Objects.equals(existingUser.followUp(), followUpName)) {
            return Mono.error(AskAiProblemException.idempotencyConflict());
        }
        return repository.findPairedAssistant(conversation.id(), existingUser.ordinal())
            .flatMap(assistant -> replayOf(conversation, assistant))
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()));
    }

    private Mono<AskAiMessageResponseView> replayOf(
        final AskAiConversation conversation, final AskAiMessage assistant
    ) {
        if (assistant.validated()) {
            return Mono.just(
                view(
                    assistant.ordinal(), AskAiStoredResponse.decode(assistant.responseJson()), assistant.status(),
                    conversation.replyCount()
                )
            );
        }
        if ("pending".equals(assistant.outcome())) {
            return Mono.error(refuse("in_progress", AskAiProblemException.turnInProgress()));
        }
        return Mono.error(AskAiProblemException.contextNotFound());
    }

    /** Reserves the reply and unique client id before starting provider work. */
    private Mono<AskAiMessageResponseView> beginTurn(
        final ConversationContext context, final String clientMessageId, final String action, final String followUpName
    ) {
        final AskAiConversation conversation = context.conversation();
        return repository.beginTurn(
            conversation.id(), configuration.getConversation().turnBudget(),
            new AskAiConversationRepository.NewTurn(action, followUpName, clientMessageId)
        ).flatMap(start -> onTurnStart(context, start, clientMessageId, action, followUpName));
    }

    private Mono<AskAiMessageResponseView> onTurnStart(
        final ConversationContext context, final TurnStart start, final String clientMessageId, final String action,
        final String followUpName
    ) {
        return switch (start) {
            case TurnStart.Begun begun -> generateAgainst(context, begun.turn(), action, followUpName);
            case TurnStart.NoReplyLeft() -> Mono.error(refuse("replies", AskAiProblemException.quotaExhausted()));
            case TurnStart.NoAttemptLeft() ->
                Mono.error(refuse("attempts", AskAiProblemException.attemptsExhausted()));
            case TurnStart.AlreadyBegun() -> answerAlreadySent(
                context.conversation(), clientMessageId, action, followUpName
            ).switchIfEmpty(
                Mono.defer(() -> Mono.error(refuse("in_progress", AskAiProblemException.turnInProgress())))
            );
        };
    }

    /** Settles the turn conditionally so cancellation cannot race a successful answer into a double refund. */
    private Mono<AskAiMessageResponseView> generateAgainst(
        final ConversationContext context, final StartedTurn started, final String action, final String followUpName
    ) {
        return Mono.defer(() -> {
            final long startNanos = System.nanoTime();
            return prepareAndComplete(context, started, action, followUpName, startNanos)
                .onErrorResume(error -> abandon(started, outcomeOf(error), startNanos).then(Mono.error(error)))
                .doOnCancel(
                    () -> abandon(started, "cancelled", startNanos)
                        .subscribe(settled -> {
                        }, error -> log.warn("Could not abandon cancelled turn", error))
                );
        });
    }

    private Mono<Boolean> abandon(final StartedTurn started, final String outcome, final long startNanos) {
        final int latencyMs = elapsedMs(startNanos);
        return repository.settleFailed(started, outcome, latencyMs)
            .doOnNext(
                settled -> {
                    if (Boolean.TRUE.equals(settled)) {
                        recordTurn(outcome, latencyMs);
                    }
                }
            );
    }

    private Mono<AskAiMessageResponseView> prepareAndComplete(
        final ConversationContext context, final StartedTurn started, final String action, final String followUpName,
        final long startNanos
    ) {
        final AskAiConversation conversation = context.conversation();
        final AskAiFollowUp followUp;
        if ("FOLLOW_UP".equals(action)) {
            followUp = AskAiFollowUp.parse(followUpName);
        }
        else {
            followUp = null;
        }
        return answerAlreadyGiven(conversation, followUp)
            .flatMap(
                given -> loader.loadProgram(context.authorized())
                    .onErrorMap(AskAiProgramLoader::mapContextFailure)
                    .flatMap(program -> buildPromptAndContext(program, conversation, followUp, given))
            )
            .flatMap(prepared -> completeWithinGate(conversation, started, prepared, startNanos));
    }

    /** A send turned away for want of capacity never reached the model, so its turn is given back whole. */
    private Mono<AskAiMessageResponseView> completeWithinGate(
        final AskAiConversation conversation, final StartedTurn started, final PreparedRequest prepared,
        final long startNanos
    ) {
        return Mono.defer(() -> {
            if (!admissionGate.tryAcquire()) {
                return repository.discardTurn(started)
                    .then(Mono.error(refuse("capacity", AskAiProblemException.capacityExhausted())));
            }
            return complete(conversation, started, prepared, startNanos, true)
                .doFinally(signal -> admissionGate.release());
        });
    }

    /** Materialize provider errors before parsing so invalid responses are not classified as transport failures. */
    private Mono<AskAiMessageResponseView> complete(
        final AskAiConversation conversation, final StartedTurn started, final PreparedRequest prepared,
        final long startNanos, final boolean allowRetry
    ) {
        return providerClient.complete(prepared.prompt()).materialize()
            .flatMap(signal -> completeSignal(conversation, started, prepared, startNanos, allowRetry, signal));
    }

    private Mono<AskAiMessageResponseView> completeSignal(
        final AskAiConversation conversation, final StartedTurn started, final PreparedRequest prepared,
        final long startNanos, final boolean allowRetry, final Signal<String> signal
    ) {
        if (signal.isOnNext()) {
            return storeAnswer(conversation, started, prepared, signal.get(), startNanos, allowRetry);
        }
        if (
            signal.getThrowable() != null
                && Exceptions.unwrap(signal.getThrowable()) instanceof AskAiReplyCutShortException cut
        ) {
            return replyCutShort(conversation, started, prepared, startNanos, allowRetry, cut);
        }
        return Mono.error(classifyProviderError(signal.getThrowable()));
    }

    /** A reply the cap cut off is asked for again shorter; asked for again as it was, it would be cut off again. */
    private Mono<AskAiMessageResponseView> replyCutShort(
        final AskAiConversation conversation, final StartedTurn started, final PreparedRequest prepared,
        final long startNanos, final boolean allowRetry, final AskAiReplyCutShortException cut
    ) {
        if (allowRetry) {
            log.warn("Ask AI reply was cut short at the output token cap; retrying completion once for a shorter one");
            final PreparedRequest shorter = prepared.withPrompt(AskAiResponseRecovery.shorterPrompt(prepared.prompt()));
            return complete(conversation, started, shorter, startNanos, false);
        }
        log.warn("Ask AI reply was cut short at the output token cap");
        return Mono.error(AskAiProblemException.invalidModelResponse(cut));
    }

    private Mono<AskAiMessageResponseView> storeAnswer(
        final AskAiConversation conversation, final StartedTurn started, final PreparedRequest prepared,
        final String json, final long startNanos, final boolean allowRetry
    ) {
        final AskAiResponse response;
        try {
            response = RESPONSE_PARSER
                .parse(
                    json, prepared.context().allowedReferenceKinds(),
                    AskAiFollowUp.offeredFor(prepared.request(), prepared.context())
                )
                .checkingCodeAgainst(prepared.program())
                .simplifiedFor(prepared.request(), prepared.answerAlreadyGiven())
                .offeringFollowUpsFor(prepared.request());
        }
        catch (IllegalArgumentException invalid) {
            if (allowRetry) {
                log.warn("Ask AI response failed validation ({}); retrying completion once", invalid.getMessage());
                final PreparedRequest corrected = prepared.withPrompt(
                    AskAiResponseRecovery.correctivePrompt(prepared.prompt())
                );
                return complete(conversation, started, corrected, startNanos, false);
            }
            // Log validation details, never model text from a learner's project.
            log.warn("Ask AI response failed validation: {}", invalid.getMessage());
            return Mono.error(AskAiProblemException.invalidModelResponse(invalid));
        }
        final AskAiStoredResponse stored = AskAiStoredResponse.of(response);
        final String status = response.status().jsonValue();
        final int latencyMs = elapsedMs(startNanos);
        return repository.settleAnswered(started, status, stored.encode(), latencyMs)
            .flatMap(settled -> answeredOrAbandoned(started, stored, status, latencyMs, settled));
    }

    private Mono<AskAiMessageResponseView> answeredOrAbandoned(
        final StartedTurn started, final AskAiStoredResponse stored, final String status, final int latencyMs,
        final Boolean settled
    ) {
        if (!Boolean.TRUE.equals(settled)) {
            recordTurn("abandoned", latencyMs);
            return Mono.error(
                AskAiProblemException.providerUnavailable(
                    new IllegalStateException("the answer arrived after the turn had been settled")
                )
            );
        }
        recordTurn("validated", latencyMs);
        return Mono.just(view(started.assistantOrdinal(), stored, status, started.repliesUsed()));
    }

    private static RuntimeException classifyProviderError(final Throwable error) {
        if (error == null) {
            return AskAiProblemException.providerUnavailable(new IllegalStateException("provider answered nothing"));
        }
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof TimeoutException) {
            return AskAiProblemException.timeout(cause);
        }
        return AskAiProblemException.providerUnavailable(cause);
    }

    private static String outcomeOf(final Throwable error) {
        return switch (Exceptions.unwrap(error)) {
            case AskAiProblemException problem -> switch (problem.reason()) {
                case TIMEOUT -> "timeout";
                case PROVIDER_UNAVAILABLE -> "provider_error";
                case INVALID_MODEL_RESPONSE -> "invalid_response";
                case CONTEXT_NOT_FOUND -> "context_unavailable";
                default -> "failed";
            };
            default -> "failed";
        };
    }

    /** Supplies the prior answer to follow-ups without sending the rest of the transcript. */
    private Mono<String> answerAlreadyGiven(final AskAiConversation conversation, final AskAiFollowUp followUp) {
        if (followUp == null) {
            return Mono.just("");
        }
        return repository.findLatestAnswer(conversation.id())
            .map(assistant -> quotedAnswer(assistant.responseJson()))
            .defaultIfEmpty("");
    }

    private static String quotedAnswer(final String responseJson) {
        if (responseJson == null) {
            return "";
        }
        return AskAiStoredResponse.decode(responseJson).asQuotedAnswer();
    }

    private Mono<PreparedRequest> buildPromptAndContext(
        final Program program, final AskAiConversation conversation, final AskAiFollowUp followUp,
        final String answerAlreadyGiven
    ) {
        return Mono.fromCallable(() -> prepareRequest(program, conversation, followUp, answerAlreadyGiven));
    }

    private PreparedRequest prepareRequest(
        final Program program, final AskAiConversation conversation, final AskAiFollowUp followUp,
        final String answerAlreadyGiven
    ) {
        final AskAiSelection selection = buildSelection(
            conversation.scopeKind(), conversation.scopeSelector(), conversation.locale(), followUp
        );
        final AskAiRequest request;
        try {
            request = REQUEST_RESOLVER.resolve(program, selection);
        }
        catch (IllegalArgumentException stale) {
            throw refused("resolve", conversation, stale);
        }
        final AskAiContext context;
        try {
            context = CONTEXT_ASSEMBLER.assemble(program, request);
        }
        catch (IllegalArgumentException unusable) {
            throw refused("assemble", conversation, unusable);
        }
        final AskAiPrompt prompt = new AskAiPromptBuilder(request.locale())
            .build(request, context, answerAlreadyGiven);
        if (answerAlreadyGiven.isEmpty()) {
            return new PreparedRequest(context, prompt, program, request, null);
        }
        return new PreparedRequest(context, prompt, program, request, answerAlreadyGiven);
    }

    /** Logs the internal preparation failure and returns the generic context-not-found problem. */
    private AskAiProblemException refused(
        final String stage, final AskAiConversation conversation, final IllegalArgumentException cause
    ) {
        log.warn(
            "Ask AI cannot prepare a reply ({} refused: {}); scope {} of conversation {}",
            stage, cause.getMessage(), conversation.scopeKind(), conversation.publicId()
        );
        return refuse("context", AskAiProblemException.contextNotFound());
    }

    private void recordTurn(final String outcome, final int latencyMs) {
        Timer.builder(TURN_TIMER).tag("outcome", outcome).register(metrics)
            .record(Duration.ofMillis(latencyMs));
    }

    private <T extends RuntimeException> T refuse(final String reason, final T refusal) {
        metrics.counter(REFUSED_COUNTER, "reason", reason).increment();
        return refusal;
    }

    /**
     * Closes a visible conversation for its owning submission and analysis.
     *
     * @param submissionToken      token proving access to the submission
     * @param analysisId           analysis whose conversation is addressed
     * @param conversationPublicId public conversation identifier
     * @return completion when the conversation has been closed
     */
    public Mono<Void> closeConversation(
        final String submissionToken, final long analysisId, final String conversationPublicId
    ) {
        return loader.authorize(submissionToken, analysisId)
            .flatMap(
                authorized -> repository.find(
                    authorized.submission().id(), authorized.analysis().id(), conversationPublicId
                )
            )
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()))
            .flatMap(conversation -> repository.close(conversation.id()))
            .onErrorMap(AskAiProgramLoader::mapContextFailure);
    }

    private static AskAiSelection buildSelection(
        final String scopeKind, final String scopeSelector, final String locale, final AskAiFollowUp followUp
    ) {
        if ("finding".equals(scopeKind)) {
            return new AskAiSelection(null, null, null, null, locale, false, scopeSelector, null, followUp);
        }
        if ("common".equals(scopeKind)) {
            return new AskAiSelection(
                commonQuery(scopeSelector), commonTarget(scopeSelector), null, null, locale, false, null, null,
                followUp
            );
        }
        return new AskAiSelection(scopeSelector, null, null, null, locale, false, null, null, followUp);
    }

    private static String commonQuery(final String selector) {
        final int at = selector.indexOf('@');
        if (at < 0) {
            return selector;
        }
        return selector.substring(0, at);
    }

    private static String commonTarget(final String selector) {
        final int at = selector.indexOf('@');
        if (at < 0) {
            return null;
        }
        return selector.substring(at + 1);
    }

    private static boolean validScope(final String kind, final String selector) {
        if (selector == null || selector.isBlank() || selector.length() > 200) {
            return false;
        }
        return switch (kind) {
            case "common" -> ALLOWED_COMMON_SELECTORS.contains(commonQuery(selector))
                && validCommonTarget(commonTarget(selector));
            case "inquiry" -> selector.startsWith("inquiry:v1-");
            case "finding" -> selector.startsWith("finding:v1-");
            case null, default -> false;
        };
    }

    private static boolean validCommonTarget(final String target) {
        return target == null || TARGET_KEY.matcher(target).matches();
    }

    private String label(final AskAiRequest request, final String locale) {
        return switch (request) {
            case AskAiRequest.Common common -> common.query().name();
            case AskAiRequest.SelectedInquiry inquiry -> inquiry.inquiry().question()
                .resolve(IssueTranslatorFactory.getIssueTranslator(Locale.of(locale)));
            case AskAiRequest.Finding finding -> finding.context().findingText();
        };
    }

    private static int elapsedMs(final long startNanos) {
        final long elapsed = (System.nanoTime() - startNanos) / 1_000_000;
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, elapsed));
    }

    private AskAiMessageResponseView view(
        final int assistantOrdinal, final AskAiStoredResponse stored, final String status, final int usedReplies
    ) {
        return new AskAiMessageResponseView(
            AskAiQuestionCatalogue.SCHEMA_VERSION, String.valueOf(assistantOrdinal), status, stored.blockViews(),
            stored.references(), stored.followUps(), repliesRemaining(usedReplies)
        );
    }

    private int repliesRemaining(final int usedReplies) {
        return Math.max(0, configuration.getConversation().getMaxRepliesPerConversation() - usedReplies);
    }

    private record ResolvedCreation(AskAiProgramLoader.Authorized authorized, AskAiRequest request) {
    }

    private record ConversationContext(AskAiProgramLoader.Authorized authorized, AskAiConversation conversation) {
    }

    /**
     * What a reply is checked against once it arrives: the code it may quote, the follow-ups the question allows, and
     * the answer a simplification must not repeat. Kept with the prompt so a retry with another prompt keeps them.
     */
    private record PreparedRequest(
        AskAiContext context, AskAiPrompt prompt, Program program, AskAiRequest request, String answerAlreadyGiven
    ) {

        PreparedRequest withPrompt(final AskAiPrompt other) {
            return new PreparedRequest(context, other, program, request, answerAlreadyGiven);
        }
    }
}
