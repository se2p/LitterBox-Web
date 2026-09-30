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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiContextAssembler;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiListingOptions;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPrompt;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiPromptBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiQuestionService;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiRequest;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiRequestResolver;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiSelection;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetCatalogue;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetCatalogueBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetKind;
import de.uni_passau.fim.se2.litterbox.llm.askai.inquiry.ScratchInquiryAnalyzer;
import de.uni_passau.fim.se2.litterbox_web.util.FixtureLoader;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversation;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.StartedTurn;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.TurnStart;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiMessage;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.Disposable;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

class AskAiConversationServiceTest {

    private static final String ENGLISH_LOCALE = "en";
    private static final String VALIDATED = "validated";
    private static final String COMMON_SCOPE_KIND = "common";
    private static final String COMMON_SUMMARISE_SELECTOR = "common:SUMMARISE";
    private static final String ASK_ACTION = "ASK";
    private static final String ANSWER_STATUS = "answer";
    private static final String FOLLOW_UP_ACTION = "FOLLOW_UP";
    private static final String TOKEN = "synthetic-token";
    private static final long ANALYSIS_ID = 91;
    private static final long SUBMISSION_ID = 51;
    private static final long CONVERSATION_ID = 1001;
    private static final String CONVERSATION_PUBLIC_ID = "conversation-public-id";
    private static final Program PROGRAM = parseFixture();
    private static final String VALID_ANSWER_JSON = "{\"status\":\"answer\",\"blocks\":[{\"kind\":\"text\",\"text\":\"Answer.\"},"
        + "{\"kind\":\"scratchblocks\",\"role\":\"example\",\"code\":\"when green flag clicked\\nsay [Hello!]\"}],"
        + "\"references\":[],\"followUps\":[\"EXPLAIN_SIMPLY\"]}";
    private static final String INVALID_JSON = "{\"status\":\"answer\"}";

    private final AskAiProgramLoader loader = mock(AskAiProgramLoader.class);
    private final AskAiConversationRepository repository = mock(AskAiConversationRepository.class);
    private final AskAiConfigurationProperties configuration = new AskAiConfigurationProperties();
    private final AskAiAdmissionGate gate = new AskAiAdmissionGate(configuration);
    private final Clock clock = Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC);
    private final FakeProviderClient provider = new FakeProviderClient();
    private final MeterRegistry metrics = new SimpleMeterRegistry();

    private final AskAiProgramLoader.Authorized authorized = new AskAiProgramLoader.Authorized(
        new Submission(SUBMISSION_ID, TOKEN, "SINGLE_PROJECT", ENGLISH_LOCALE, "COMPLETED", "ACTIVE", 1, 1, 0),
        new Analysis(ANALYSIS_ID, SUBMISSION_ID, 1, "NEW", "1", "1", ENGLISH_LOCALE, "DONE", ".sb3")
    );

    private AskAiConversationService service() {
        return new AskAiConversationService(loader, repository, provider, gate, configuration, clock, metrics);
    }

    @BeforeEach
    void aTurnCanBeBegun() {
        when(repository.beginTurn(anyLong(), any(), any()))
            .thenReturn(Mono.just(new TurnStart.Begun(startedTurn(0, 1))));
        when(repository.settleAnswered(any(), any(), any(), any())).thenReturn(Mono.just(true));
        when(repository.settleFailed(any(), anyString(), any())).thenReturn(Mono.just(true));
        when(repository.discardTurn(any())).thenReturn(Mono.just(true));
        when(repository.findByClientMessageId(anyLong(), anyString())).thenReturn(Mono.empty());
    }

    private void stubLoader() {
        when(loader.authorize(TOKEN, ANALYSIS_ID)).thenReturn(Mono.just(authorized));
        when(loader.loadProgram(authorized)).thenReturn(Mono.just(PROGRAM));
    }

    private AskAiConversation openConversation(final int replyCount) {
        return openConversation(COMMON_SCOPE_KIND, COMMON_SUMMARISE_SELECTOR, replyCount);
    }

    private AskAiConversation openConversation(final String scopeKind, final String selector, final int replyCount) {
        return new AskAiConversation(
            CONVERSATION_ID, CONVERSATION_PUBLIC_ID, SUBMISSION_ID, ANALYSIS_ID, ENGLISH_LOCALE, scopeKind,
            selector,
            "SUMMARISE", replyCount, clock.instant().plusSeconds(3600), clock.instant().plusSeconds(7200), "OPEN"
        );
    }

    private StartedTurn startedTurn(final int ordinal, final int repliesUsed) {
        return new StartedTurn(CONVERSATION_ID, ordinal + 1L, ordinal + 2L, ordinal, repliesUsed);
    }

    @Test
    void sendsTheAnswerOnWithoutTheReferenceIdsItWasWrittenWith() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(
            prompt -> Mono.just(
                "{\"status\":\"answer\",\"blocks\":[{\"kind\":\"text\",\"text\":\"The cat moves "
                    + "(ref:v1-abc123).\"},{\"kind\":\"scratchblocks\",\"role\":\"existing\",\"code\":\"when green "
                    + "flag clicked\"}],\"references\":[],\"followUps\":[]}"
            )
        );

        final AskAiMessageResponseView view = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "client-1", ASK_ACTION, null
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.blocks()).first().isInstanceOfSatisfying(
            AskAiBlockView.Text.class, text -> assertThat(text.text()).isEqualTo("The cat moves.")
        );
    }

    @Test
    void opensAConversationAndReturnsTheFrozenCreatedShape() {
        stubLoader();
        when(repository.createWithinCap(any(), anyInt(), any())).thenAnswer(
            invocation -> {
                final AskAiConversationRepository.NewConversation request = invocation.getArgument(0);
                assertThat(request.submissionId()).isEqualTo(SUBMISSION_ID);
                assertThat(request.analysisId()).isEqualTo(ANALYSIS_ID);
                assertThat(request.scopeKind()).isEqualTo(COMMON_SCOPE_KIND);
                assertThat(request.scopeSelector()).isEqualTo(COMMON_SUMMARISE_SELECTOR);
                assertThat(request.scopeLabel()).isEqualTo("SUMMARISE");
                return Mono.just(openConversation(0));
            }
        );

        final AskAiConversationCreatedView view = service().createConversation(
            TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, COMMON_SCOPE_KIND, COMMON_SUMMARISE_SELECTOR
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.schemaVersion()).isEqualTo(1);
        assertThat(view.conversationId()).isEqualTo(CONVERSATION_PUBLIC_ID);
        assertThat(view.scope().kind()).isEqualTo(COMMON_SCOPE_KIND);
        assertThat(view.scope().label()).isEqualTo("SUMMARISE");
        assertThat(view.repliesRemaining()).isEqualTo(configuration.getConversation().getMaxRepliesPerConversation());
    }

    @Test
    void opensAGeneralQuestionAboutOneSpriteWhenTheSelectorNamesOne() {
        stubLoader();
        final String sprite = firstTargetOfKind(ScratchTargetKind.SPRITE);
        when(repository.createWithinCap(any(), anyInt(), any())).thenAnswer(
            invocation -> {
                final AskAiConversationRepository.NewConversation request = invocation.getArgument(0);
                assertThat(request.scopeSelector()).isEqualTo("common:SUMMARISE@" + sprite);
                return Mono.just(openConversation(0));
            }
        );

        assertThat(
            service()
                .createConversation(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, COMMON_SCOPE_KIND, "common:SUMMARISE@" + sprite)
                .block()
        ).isNotNull();
    }

    @Test
    void refusesAGeneralQuestionThePlaceItNamesCannotBeAsked() {
        stubLoader();

        assertThatThrownBy(
            () -> service().createConversation(
                TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, COMMON_SCOPE_KIND,
                "common:SUMMARISE@" + firstTargetOfKind(ScratchTargetKind.SCRIPT)
            ).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
        );
        verify(repository, never()).createWithinCap(any(), anyInt(), any());
    }

    @Test
    void rejectsACommonSelectorWhoseTargetIsNotOne() {
        stubLoader();

        assertThatThrownBy(
            () -> service().createConversation(
                TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, COMMON_SCOPE_KIND, "common:SUMMARISE@inquiry:v1-a"
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAnUnsupportedScopeKindAsAnInvalidRequest() {
        stubLoader();

        assertThatThrownBy(
            () -> service().createConversation(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, "unknown", COMMON_SUMMARISE_SELECTOR)
                .block()
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAStaleOrUnknownSelectorAsContextNotFound() {
        stubLoader();

        assertThatThrownBy(
            () -> service().createConversation(
                TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, "inquiry", "inquiry:v1-doesnotexist"
            ).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
        );
    }

    @Test
    void deniesOpeningAConversationOnceTheActiveLimitIsReached() {
        stubLoader();
        when(repository.createWithinCap(any(), anyInt(), any())).thenReturn(Mono.empty());

        assertThatThrownBy(
            () -> service()
                .createConversation(TOKEN, ANALYSIS_ID, ENGLISH_LOCALE, COMMON_SCOPE_KIND, COMMON_SUMMARISE_SELECTOR)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.QUOTA_EXHAUSTED)
        );
    }

    @Test
    void answersAFreshAskAndBindsTheAnswerToTheTurnItWasBegunAs() {
        stubLoader();
        stubOpenConversation(openConversation(0));

        final AskAiMessageResponseView view = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-1", ASK_ACTION, null
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.status()).isEqualTo(ANSWER_STATUS);
        assertThat(view.blocks()).hasSize(2);
        // A summary is already as simple as it gets, and the answer shows its code, so nothing is left to offer.
        assertThat(view.followUps()).isEmpty();
        assertThat(view.repliesRemaining()).isEqualTo(maxReplies() - 1);
        assertThat(provider.callCount()).isEqualTo(1);

        final ArgumentCaptor<AskAiConversationRepository.NewTurn> begun = ArgumentCaptor
            .forClass(AskAiConversationRepository.NewTurn.class);
        verify(repository).beginTurn(eq(CONVERSATION_ID), eq(turnBudget()), begun.capture());
        assertThat(begun.getValue().clientMessageId()).isEqualTo("cmid-1");
        assertThat(begun.getValue().action()).isEqualTo(ASK_ACTION);
        verify(repository).settleAnswered(eq(startedTurn(0, 1)), eq(ANSWER_STATUS), anyString(), any());
        verify(repository, never()).settleFailed(any(), anyString(), any());
    }

    @Test
    void reportsTheRepliesLeftTheDatabaseSettledOnRatherThanTheOnesReadAtTheStart() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        when(repository.beginTurn(anyLong(), any(), any()))
            .thenReturn(Mono.just(new TurnStart.Begun(startedTurn(8, 5))));

        final AskAiMessageResponseView view = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-count", ASK_ACTION, null
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.repliesRemaining()).isEqualTo(maxReplies() - 5);
        assertThat(view.messageId()).isEqualTo("9");
    }

    @Test
    void answersAFollowUpAndNormalizesItsNameBeforePersistingIt() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        // there is only something to say more simply once something has been said
        when(repository.findLatestAnswer(CONVERSATION_ID)).thenReturn(
            Mono.just(
                assistantMessage(
                    1, ASK_ACTION, null, ANSWER_STATUS,
                    "{\"blocks\":[{\"kind\":\"text\",\"text\":\"The boat sails off.\"}],"
                        + "\"references\":[],\"followUps\":[\"EXPLAIN_SIMPLY\"]}",
                    VALIDATED
                )
            )
        );

        final AskAiMessageResponseView view = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-padded", FOLLOW_UP_ACTION,
            "          explain_simply          "
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.status()).isEqualTo(ANSWER_STATUS);
        final ArgumentCaptor<AskAiConversationRepository.NewTurn> begun = ArgumentCaptor
            .forClass(AskAiConversationRepository.NewTurn.class);
        verify(repository).beginTurn(anyLong(), any(), begun.capture());
        assertThat(begun.getValue().action()).isEqualTo(FOLLOW_UP_ACTION);
        assertThat(begun.getValue().followUp()).isEqualTo("EXPLAIN_SIMPLY");
    }

    @Test
    void quotesTheAnswerAlreadyGivenBackWhenTheSameQuestionIsAskedAgain() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        when(repository.findLatestAnswer(CONVERSATION_ID)).thenReturn(
            Mono.just(
                assistantMessage(
                    1, ASK_ACTION, null, ANSWER_STATUS,
                    "{\"blocks\":[{\"kind\":\"text\",\"text\":\"The boat sails off "
                        + "(ref:v1-abc123).\"},{\"kind\":\"scratchblocks\",\"role\":\"existing\",\"code\":\"when "
                        + "green flag clicked\"}],\"references\":[],\"followUps\":[\"EXPLAIN_SIMPLY\"]}",
                    VALIDATED
                )
            )
        );
        final AtomicReference<AskAiPrompt> sent = new AtomicReference<>();
        provider.respondWith(
            prompt -> {
                sent.set(prompt);
                return Mono.just(VALID_ANSWER_JSON);
            }
        );

        service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-2", FOLLOW_UP_ACTION, "EXPLAIN_SIMPLY"
        ).block();

        assertThat(sent.get()).isNotNull();
        final String prompt = sent.get().userPrompt();
        final String quoted = prompt.substring(
            prompt.indexOf("THE ANSWER ALREADY GIVEN"), prompt.indexOf("SELECTED PROJECT DATA")
        );
        assertThat(quoted).contains("The boat sails off.");
        assertThat(quoted).doesNotContain("ref:v1-");
        assertThat(quoted).contains(AskAiPromptBuilder.quotedCode("when green flag clicked"));
    }

    @Test
    void looksForNoAnswerToQuoteWhenAQuestionIsBeingAskedForTheFirstTime() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        final AtomicReference<AskAiPrompt> sent = new AtomicReference<>();
        provider.respondWith(
            prompt -> {
                sent.set(prompt);
                return Mono.just(VALID_ANSWER_JSON);
            }
        );

        service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-1", ASK_ACTION, null).block();

        assertThat(sent.get().userPrompt()).doesNotContain("THE ANSWER ALREADY GIVEN");
        verify(repository, never()).findLatestAnswer(anyLong());
    }

    @Test
    void rejectsAnUnknownFollowUpNameAsAnInvalidRequest() {
        stubLoader();
        stubOpenConversation(openConversation(0));

        assertThatThrownBy(
            () -> service().postMessage(
                TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-x", FOLLOW_UP_ACTION, "NOT_A_FOLLOW_UP"
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsAFollowUpAsTheFirstTurnWithoutSpendingTheBudget() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        when(repository.findLatestAnswer(CONVERSATION_ID)).thenReturn(Mono.empty());

        assertThatThrownBy(
            () -> service().postMessage(
                TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-first", FOLLOW_UP_ACTION, "EXPLAIN_SIMPLY"
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);

        assertThat(provider.callCount()).isZero();
        verify(repository, never()).beginTurn(anyLong(), any(), any());
    }

    @Test
    void rejectsAFollowUpTheLatestAnswerDidNotOfferWithoutSpendingTheBudget() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        when(repository.findLatestAnswer(CONVERSATION_ID)).thenReturn(
            Mono.just(
                assistantMessage(
                    1, ASK_ACTION, null, ANSWER_STATUS,
                    "{\"blocks\":[{\"kind\":\"text\",\"text\":\"The boat sails off.\"}],"
                        + "\"references\":[],\"followUps\":[\"EXPLAIN_SIMPLY\"]}",
                    VALIDATED
                )
            )
        );

        assertThatThrownBy(
            () -> service().postMessage(
                TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-other", FOLLOW_UP_ACTION, "SHOW_THE_FIX"
            ).block()
        ).isInstanceOf(IllegalArgumentException.class);

        assertThat(provider.callCount()).isZero();
        verify(repository, never()).beginTurn(anyLong(), any(), any());
    }

    @Test
    void chargesAnInvalidModelResponseAsASpentReply() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(prompt -> Mono.just(INVALID_JSON));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-3", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.INVALID_MODEL_RESPONSE)
        );

        assertThat(provider.callCount()).isEqualTo(2);
        verify(repository, times(1))
            .settleFailed(eq(startedTurn(0, 1)), eq("invalid_response"), any());
        verify(repository, never()).settleAnswered(any(), any(), any(), any());
    }

    @Test
    void retriesOnceWhenFirstModelResponseIsInvalidAndSucceedsOnSecondAttempt() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        final AtomicInteger callCount = new AtomicInteger(0);
        final AtomicReference<AskAiPrompt> firstPrompt = new AtomicReference<>();
        final AtomicReference<AskAiPrompt> retriedPrompt = new AtomicReference<>();
        provider.respondWith(
            prompt -> {
                if (callCount.incrementAndGet() == 1) {
                    firstPrompt.set(prompt);
                    return Mono.just(INVALID_JSON);
                }
                retriedPrompt.set(prompt);
                return Mono.just(VALID_ANSWER_JSON);
            }
        );

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-retry", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(result.blocks()).hasSize(2);
        assertThat(callCount.get()).isEqualTo(2);
        assertThat(firstPrompt.get().systemPrompt()).doesNotContain("Your previous answer could not be used");
        assertThat(retriedPrompt.get().systemPrompt())
            .startsWith(firstPrompt.get().systemPrompt())
            .contains("Your previous answer could not be used");
        assertThat(retriedPrompt.get().userPrompt()).isEqualTo(firstPrompt.get().userPrompt());
        verify(repository, times(1)).beginTurn(anyLong(), any(), any());
        verify(repository, times(1)).settleAnswered(any(), any(), any(), any());
        verify(repository, never()).settleFailed(any(), anyString(), any());
    }

    @Test
    void asksForAShorterAnswerWhenTheReplyWasCutOffAtTheTokenCap() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        final List<AskAiPrompt> prompts = new ArrayList<>();
        provider.respondWith(
            prompt -> {
                prompts.add(prompt);
                if (prompts.size() == 1) {
                    return Mono.error(new AskAiReplyCutShortException());
                }
                return Mono.just(VALID_ANSWER_JSON);
            }
        );

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-cut-short", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(prompts).hasSize(2);
        assertThat(prompts.get(1).systemPrompt())
            .startsWith(prompts.get(0).systemPrompt())
            .contains("cut off before it ended");
        verify(repository, times(1)).settleAnswered(any(), any(), any(), any());
    }

    @Test
    void aReplyCutOffTwiceIsAnInvalidModelResponseNotAProviderOutage() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(prompt -> Mono.error(new AskAiReplyCutShortException()));

        assertThatThrownBy(
            () -> service()
                .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-cut-twice", ASK_ACTION, null).block()
        ).isInstanceOf(AskAiProblemException.class)
            .extracting(problem -> ((AskAiProblemException) problem).reason())
            .isEqualTo(AskAiProblemException.Reason.INVALID_MODEL_RESPONSE);
        assertThat(provider.callCount()).isEqualTo(2);
        verify(repository).settleFailed(any(), eq("invalid_response"), any());
    }

    /** The parser repairs what it can, so a reply that is merely untidy never costs a second provider call. */
    @Test
    void trimsSurplusFollowUpsWithoutCallingTheProviderAgain() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(
            prompt -> Mono.just(
                "{\"status\":\"answer\",\"blocks\":[{\"kind\":\"text\",\"text\":\"Answer.\"}],"
                    + "\"references\":[],\"followUps\":[\"EXPLAIN_SIMPLY\",\"SHOW_RELEVANT_BLOCKS\","
                    + "\"GIVE_HINT\",\"OBSERVE_BEHAVIOUR\",\"EXPLAIN_CONCEPT\",\"SHOW_THE_FIX\"]}"
            )
        );

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-local-repair", ASK_ACTION, null).block();

        // A summary offers only the follow-ups that fit it; the rest are dropped here rather than asked for again.
        assertThat(result).isNotNull();
        assertThat(result.followUps()).containsExactly("SHOW_RELEVANT_BLOCKS");
        assertThat(provider.callCount()).isEqualTo(1);
    }

    @Test
    void treatsAProviderFailureAsUnavailableAndSettlesTheTurnAsOne() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(prompt -> Mono.error(new IllegalStateException("boom")));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-4", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.PROVIDER_UNAVAILABLE)
        );

        verify(repository).settleFailed(eq(startedTurn(0, 1)), eq("provider_error"), any());
    }

    @Test
    void treatsATimeoutAsATimeoutOutcome() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(prompt -> Mono.error(new TimeoutException("slow")));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-5", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(AskAiProblemException.class, assertReason(AskAiProblemException.Reason.TIMEOUT));

        verify(repository).settleFailed(eq(startedTurn(0, 1)), eq("timeout"), any());
    }

    @Test
    void settlesAContextThatCannotBePreparedUnderItsOwnName() {
        stubLoader();
        stubOpenConversation(
            new AskAiConversation(
                CONVERSATION_ID, CONVERSATION_PUBLIC_ID, SUBMISSION_ID, ANALYSIS_ID, ENGLISH_LOCALE, "inquiry",
                "inquiry:v1-gone", "gone", 0, clock.instant().plusSeconds(3600),
                clock.instant().plusSeconds(7200), "OPEN"
            )
        );

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-ctx", ASK_ACTION, null)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
        );

        verify(repository)
            .settleFailed(eq(startedTurn(0, 1)), eq("context_unavailable"), any());
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void refundsAReplyWhenTheProjectCannotBeLoaded() {
        when(loader.authorize(TOKEN, ANALYSIS_ID)).thenReturn(Mono.just(authorized));
        when(loader.loadProgram(authorized)).thenReturn(Mono.error(new IllegalStateException("unreadable archive")));
        stubOpenConversation(openConversation(0));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-core", ASK_ACTION, null)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
        );

        verify(repository)
            .settleFailed(eq(startedTurn(0, 1)), eq("context_unavailable"), any());
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void reportsWhenAnAnswerArrivesAfterItsTurnWasSettled() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        when(repository.settleAnswered(any(), any(), any(), any())).thenReturn(Mono.just(false));
        when(repository.settleFailed(any(), anyString(), any())).thenReturn(Mono.just(false));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-late", ASK_ACTION, null)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.PROVIDER_UNAVAILABLE)
        );
    }

    @Test
    void deniesAReplyOnceTheConversationRepliesAreExhausted() {
        stubLoader();
        stubOpenConversation(openConversation(maxReplies()));
        when(repository.beginTurn(anyLong(), any(), any())).thenReturn(Mono.just(new TurnStart.NoReplyLeft()));

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-6", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.QUOTA_EXHAUSTED)
        );
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void deniesAReplyOnceTheConversationAttemptsAreExhaustedEvenWithRepliesLeft() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        when(repository.beginTurn(anyLong(), any(), any())).thenReturn(Mono.just(new TurnStart.NoAttemptLeft()));

        // Not the reply quota: the reader may still have every reply, and must not be told otherwise.
        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-7", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.ATTEMPTS_EXHAUSTED)
        );
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void deniesAReplyWhenTheConcurrentGenerationGateIsFull() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        for (int i = 0; i < configuration.getConversation().getMaxConcurrentGenerations(); i++) {
            assertThat(gate.tryAcquire()).isTrue();
        }

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-7", ASK_ACTION, null).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CAPACITY_EXHAUSTED)
        );
        assertThat(provider.callCount()).isZero();
        verify(repository).discardTurn(startedTurn(0, 1));
        verify(repository, never()).settleAnswered(any(), any(), any(), any());
    }

    @Test
    void keepsTheClaimedReplySpentWhenTheReaderCancelsMidCall() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        provider.respondWith(prompt -> Sinks.<String>one().asMono());

        service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-gone", ASK_ACTION, null)
            .subscribe()
            .dispose();

        verify(repository, times(1))
            .settleFailed(eq(startedTurn(0, 1)), eq("cancelled"), any());
    }

    /** Cancellation and answer settlement may race; only a successful settlement is counted. */
    @Test
    void countsNoAbandonmentWhenTheAnswerWasAlreadyWrittenDown() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        when(repository.settleFailed(any(), anyString(), any())).thenReturn(Mono.just(false));
        provider.respondWith(prompt -> Sinks.<String>one().asMono());

        service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-raced", ASK_ACTION, null)
            .subscribe()
            .dispose();

        verify(repository, times(1)).settleFailed(any(), eq("cancelled"), any());
        assertThat(metrics.find("litterbox.ask.ai.turns").tag("outcome", "cancelled").timer()).isNull();
    }

    @Test
    void takesNoAdmissionPermitWhileTheProjectIsLoading() {
        when(loader.authorize(TOKEN, ANALYSIS_ID)).thenReturn(Mono.just(authorized));
        when(loader.loadProgram(authorized)).thenReturn(Mono.never());
        stubOpenConversation(openConversation(0));

        final Disposable pending = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-loading", ASK_ACTION, null)
            .subscribe();

        for (int held = 0; held < configuration.getConversation().getMaxConcurrentGenerations(); held++) {
            assertThat(gate.tryAcquire()).isTrue();
        }
        pending.dispose();
    }

    private int maxReplies() {
        return configuration.getConversation().getMaxRepliesPerConversation();
    }

    private AskAiConversationRepository.TurnBudget turnBudget() {
        return configuration.getConversation().turnBudget();
    }

    @Test
    void releasesTheAdmissionLeaseOnCancellation() {
        stubLoader();
        stubOpenConversation(openConversation(0));
        final Sinks.One<String> neverCompletes = Sinks.one();
        provider.respondWith(prompt -> neverCompletes.asMono());

        final Disposable disposable = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-8", ASK_ACTION, null)
            .subscribe();
        disposable.dispose();

        assertThat(gate.tryAcquire()).isTrue();
    }

    @Test
    void replaysTheStoredResponseForARepeatedClientMessageId() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        final String storedJson = "{\"blocks\":[{\"kind\":\"text\",\"text\":\"Stored.\"}],"
            + "\"references\":[],\"followUps\":[]}";
        when(repository.findByClientMessageId(CONVERSATION_ID, "cmid-9")).thenReturn(
            Mono.just(userMessage(0, ASK_ACTION, null, "cmid-9"))
        );
        when(repository.findPairedAssistant(CONVERSATION_ID, 0)).thenReturn(
            Mono.just(assistantMessage(1, ASK_ACTION, null, ANSWER_STATUS, storedJson, VALIDATED))
        );

        final AskAiMessageResponseView view = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-9", ASK_ACTION, null
        ).block();

        assertThat(view).isNotNull();
        assertThat(view.blocks()).hasSize(1);
        assertThat(provider.callCount()).isZero();
        verify(repository, never()).beginTurn(anyLong(), any(), any());
    }

    @Test
    void refusesAReplayWhoseContentDoesNotMatchTheFirstAttempt() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        when(repository.findByClientMessageId(CONVERSATION_ID, "cmid-10")).thenReturn(
            Mono.just(userMessage(0, ASK_ACTION, null, "cmid-10"))
        );

        assertThatThrownBy(
            () -> service().postMessage(
                TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-10", FOLLOW_UP_ACTION, "EXPLAIN_SIMPLY"
            ).block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.IDEMPOTENCY_CONFLICT)
        );
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void tellsASecondSendOfTheSameMessageThatTheFirstIsStillRunning() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        when(repository.beginTurn(anyLong(), any(), any())).thenReturn(Mono.just(new TurnStart.AlreadyBegun()));
        when(repository.findByClientMessageId(CONVERSATION_ID, "cmid-dup"))
            .thenReturn(Mono.empty())
            .thenReturn(Mono.just(userMessage(0, ASK_ACTION, null, "cmid-dup")));
        when(repository.findPairedAssistant(CONVERSATION_ID, 0)).thenReturn(
            Mono.just(assistantMessage(1, ASK_ACTION, null, null, null, "pending"))
        );

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-dup", ASK_ACTION, null)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.TURN_IN_PROGRESS)
        );
        assertThat(provider.callCount()).isZero();
    }

    @Test
    void doesNotCountARefusalWhenAnAlreadyBegunSendCanBeReplayed() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        final String storedJson = "{\"blocks\":[{\"kind\":\"text\",\"text\":\"Stored.\"}],"
            + "\"references\":[],\"followUps\":[]}";
        when(repository.beginTurn(anyLong(), any(), any())).thenReturn(Mono.just(new TurnStart.AlreadyBegun()));
        when(repository.findByClientMessageId(CONVERSATION_ID, "cmid-again"))
            .thenReturn(Mono.empty())
            .thenReturn(Mono.just(userMessage(0, ASK_ACTION, null, "cmid-again")));
        when(repository.findPairedAssistant(CONVERSATION_ID, 0)).thenReturn(
            Mono.just(assistantMessage(1, ASK_ACTION, null, ANSWER_STATUS, storedJson, VALIDATED))
        );

        assertThat(
            service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-again", ASK_ACTION, null).block()
        ).isNotNull();
        assertThat(metrics.find("litterbox.ask.ai.refused").tag("reason", "in_progress").counter()).isNull();
    }

    @Test
    void tellsARetryOfAStillRunningSendToComeBackRatherThanAskingAgain() {
        stubLoader();
        stubOpenConversation(openConversation(1));
        when(repository.findByClientMessageId(CONVERSATION_ID, "cmid-wait")).thenReturn(
            Mono.just(userMessage(0, ASK_ACTION, null, "cmid-wait"))
        );
        when(repository.findPairedAssistant(CONVERSATION_ID, 0)).thenReturn(
            Mono.just(assistantMessage(1, ASK_ACTION, null, null, null, "pending"))
        );

        assertThatThrownBy(
            () -> service().postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-wait", ASK_ACTION, null)
                .block()
        ).isInstanceOfSatisfying(
            AskAiProblemException.class, assertReason(AskAiProblemException.Reason.TURN_IN_PROGRESS)
        );
        assertThat(provider.callCount()).isZero();
        verify(repository, never()).beginTurn(anyLong(), any(), any());
    }

    @Test
    void closingAConversationIsIdempotent() {
        stubLoader();
        when(repository.find(SUBMISSION_ID, ANALYSIS_ID, CONVERSATION_PUBLIC_ID)).thenReturn(
            Mono.just(openConversation(1))
        );
        when(repository.close(CONVERSATION_ID)).thenReturn(Mono.empty());

        service().closeConversation(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID).block();

        verify(repository, times(1)).close(CONVERSATION_ID);
    }

    @Test
    void closingAnUnknownConversationIsContextNotFound() {
        stubLoader();
        when(repository.find(SUBMISSION_ID, ANALYSIS_ID, "missing")).thenReturn(Mono.empty());

        assertThatThrownBy(() -> service().closeConversation(TOKEN, ANALYSIS_ID, "missing").block())
            .isInstanceOfSatisfying(
                AskAiProblemException.class, assertReason(AskAiProblemException.Reason.CONTEXT_NOT_FOUND)
            );
    }

    private static final String NO_FOLLOW_UPS_ANSWER = "{\"status\":\"answer\",\"blocks\":[{\"kind\":\"text\","
        + "\"text\":\"Answer.\"}],\"references\":[],\"followUps\":[]}";
    private static final String FEEDBACK_SELECTOR = "common:PROVIDE_FEEDBACK";

    private String settledJson() {
        final ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(repository).settleAnswered(any(), anyString(), json.capture(), any());
        return json.getValue();
    }

    @Test
    void offersTheChangeOfASuggestionTheModelDidNotOffer() {
        stubLoader();
        stubOpenConversation(openConversation(COMMON_SCOPE_KIND, FEEDBACK_SELECTOR, 0));
        provider.respondWith(prompt -> Mono.just(NO_FOLLOW_UPS_ANSWER));

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-feedback", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(result.followUps()).contains("SHOW_THE_FIX");
        assertThat(settledJson()).contains("SHOW_THE_FIX");
    }

    @Test
    void doesNotOfferTheChangeOfFeedbackOnCodeWithoutFindings() {
        final String cleanActor = cleanActorTarget();
        stubLoader();
        stubOpenConversation(openConversation(COMMON_SCOPE_KIND, FEEDBACK_SELECTOR + "@" + cleanActor, 0));
        provider.respondWith(prompt -> Mono.just(NO_FOLLOW_UPS_ANSWER));

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-clean", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo(ANSWER_STATUS);
        assertThat(result.followUps()).doesNotContain("SHOW_THE_FIX");
        assertThat(settledJson()).doesNotContain("SHOW_THE_FIX");
    }

    @Test
    void leavesTheFollowUpsOfAFaultToTheLibraryPolicy() {
        final var listing = new AskAiQuestionService(
            new ScratchInquiryAnalyzer(), new ScratchTargetCatalogueBuilder()
        ).questions(PROGRAM, new AskAiListingOptions(ENGLISH_LOCALE, null, 0, 0, null, null, false));
        assertThat(listing.findings()).isNotEmpty();
        stubLoader();
        stubOpenConversation(openConversation("finding", listing.findings().get(0).selector(), 0));
        provider.respondWith(prompt -> Mono.just(NO_FOLLOW_UPS_ANSWER));

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-fault", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo(ANSWER_STATUS);
        // The fix of a fault is offered by the library's own rule, once and not added a second time.
        assertThat(result.followUps()).containsExactly("SHOW_THE_FIX");
    }

    @Test
    void answersTheOfferedChangeOfASuggestionWithoutOfferingItAgain() {
        stubLoader();
        stubOpenConversation(openConversation(COMMON_SCOPE_KIND, FEEDBACK_SELECTOR, 1));
        when(repository.findLatestAnswer(CONVERSATION_ID)).thenReturn(
            Mono.just(
                assistantMessage(
                    1, ASK_ACTION, null, ANSWER_STATUS,
                    "{\"blocks\":[{\"kind\":\"text\",\"text\":\"Try more.\"}],"
                        + "\"references\":[],\"followUps\":[\"SHOW_THE_FIX\"]}",
                    VALIDATED
                )
            )
        );
        provider.respondWith(prompt -> Mono.just(NO_FOLLOW_UPS_ANSWER));

        final var result = service().postMessage(
            TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-fix", FOLLOW_UP_ACTION, "SHOW_THE_FIX"
        ).block();

        assertThat(result).isNotNull();
        assertThat(provider.callCount()).isEqualTo(1);
        assertThat(result.followUps()).doesNotContain("SHOW_THE_FIX");
        assertThat(settledJson()).doesNotContain("SHOW_THE_FIX");
    }

    @Test
    void doesNotOfferTheChangeOfASuggestionWhenTheModelCannotAnswer() {
        stubLoader();
        stubOpenConversation(openConversation(COMMON_SCOPE_KIND, FEEDBACK_SELECTOR, 0));
        provider.respondWith(
            prompt -> Mono.just(
                "{\"status\":\"cannot_answer\",\"blocks\":[{\"kind\":\"text\",\"text\":\"No.\"}],"
                    + "\"references\":[],\"followUps\":[]}"
            )
        );

        final var result = service()
            .postMessage(TOKEN, ANALYSIS_ID, CONVERSATION_PUBLIC_ID, "cmid-cannot", ASK_ACTION, null).block();

        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("cannot_answer");
        assertThat(result.followUps()).isEmpty();
        assertThat(settledJson()).doesNotContain("SHOW_THE_FIX");
    }

    private void stubOpenConversation(final AskAiConversation conversation) {
        when(
            repository.findVisible(eq(SUBMISSION_ID), eq(ANALYSIS_ID), eq(CONVERSATION_PUBLIC_ID), any())
        ).thenReturn(Mono.just(conversation));
    }

    private static Consumer<AskAiProblemException> assertReason(final AskAiProblemException.Reason reason) {
        return problem -> assertThat(problem.reason()).isEqualTo(reason);
    }

    private AskAiMessage userMessage(
        final int ordinal, final String action, final String followUp, final String clientMessageId
    ) {
        return new AskAiMessage(
            ordinal + 1L, CONVERSATION_ID, ordinal, "user", action, followUp, null, null, VALIDATED, null,
            clientMessageId
        );
    }

    private AskAiMessage assistantMessage(
        final int ordinal, final String action, final String followUp, final String status,
        final String responseJson, final String outcome
    ) {
        return new AskAiMessage(
            ordinal + 1L, CONVERSATION_ID, ordinal, "assistant", action, followUp, status, responseJson, outcome, 5,
            null
        );
    }

    /** An actor whose feedback context lists no LitterBox finding, found the way the service assembles it. */
    private static String cleanActorTarget() {
        final ScratchTargetCatalogue catalogue = new ScratchTargetCatalogueBuilder().buildForResolution(PROGRAM, false);
        return catalogue.actors().stream()
            .map(ScratchTargetCatalogue.TargetEntry::key)
            .filter(actorKey -> !feedbackContextListsAFinding(actorKey))
            .findFirst()
            .orElseThrow();
    }

    private static boolean feedbackContextListsAFinding(final String actorKey) {
        final AskAiRequest request = new AskAiRequestResolver(
            new ScratchInquiryAnalyzer(), new ScratchTargetCatalogueBuilder()
        ).resolve(
            PROGRAM,
            new AskAiSelection(FEEDBACK_SELECTOR, actorKey, null, null, ENGLISH_LOCALE, false, null, null, null)
        );
        return new AskAiContextAssembler().assemble(PROGRAM, request).facts().stream()
            .anyMatch(fact -> fact.startsWith("LitterBox finding ("));
    }

    private static String firstTargetOfKind(final ScratchTargetKind kind) {
        final ScratchTargetCatalogue catalogue = new ScratchTargetCatalogueBuilder().buildForResolution(PROGRAM, false);
        return Stream.concat(
            Stream.concat(Stream.of(catalogue.program()), catalogue.actors().stream()),
            catalogue.scripts().stream()
        )
            .filter(target -> target.kind() == kind)
            .map(ScratchTargetCatalogue.TargetEntry::key)
            .findFirst()
            .orElseThrow();
    }

    private static Program parseFixture() {
        try {
            return FixtureLoader.loadProgramFixture("scratch_programs/boatRace.json");
        }
        catch (IOException | ParsingException exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    private static final class FakeProviderClient implements AskAiProviderClient {

        private final AtomicInteger calls = new AtomicInteger();
        private volatile Function<AskAiPrompt, Mono<String>> behavior = prompt -> Mono.just(VALID_ANSWER_JSON);

        void respondWith(final Function<AskAiPrompt, Mono<String>> newBehavior) {
            behavior = newBehavior;
        }

        int callCount() {
            return calls.get();
        }

        @Override
        public Mono<String> complete(final AskAiPrompt prompt) {
            calls.incrementAndGet();
            return behavior.apply(prompt);
        }
    }
}
