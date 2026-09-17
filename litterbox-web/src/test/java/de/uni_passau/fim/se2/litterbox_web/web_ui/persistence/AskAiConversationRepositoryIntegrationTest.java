/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import de.uni_passau.fim.se2.litterbox_web.util.TestDatabase;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.StartedTurn;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AskAiConversationRepository.TurnStart;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AskAiConversations;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AskAiMessages;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.TestRepositories;

class AskAiConversationRepositoryIntegrationTest {

    private static final int WRITERS = 16;
    private static final int MAX_ACTIVE = 3;
    private static final int REPLY_BUDGET = 8;
    private static final int FAILED_ATTEMPTS = 2;
    private static final String ANSWER = "answer";
    private static final String EMPTY_BLOCKS = "{\"blocks\":[]}";
    private static final AskAiConversationRepository.TurnBudget BUDGET = new AskAiConversationRepository.TurnBudget(
        REPLY_BUDGET, REPLY_BUDGET + FAILED_ATTEMPTS
    );

    private final Map<Long, Long> submissionsByAnalysis = new ConcurrentHashMap<>();

    @Test
    void aConversationNobodyCanSeeAnyMoreHoldsNoPlace() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_expiry");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "expiry");
            final AskAiConversationRepository conversations = repository(repositories);
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);

            for (int index = 0; index < MAX_ACTIVE; index++) {
                assertThat(conversations.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block())
                    .isNotNull();
            }
            assertThat(conversations.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block())
                .as("the fourth is refused while the first three are still open and visible")
                .isNull();

            final Instant afterTheyExpire = now.plus(Duration.ofDays(8));

            assertThat(
                conversations.createWithinCap(opening(analysisId, afterTheyExpire), MAX_ACTIVE, afterTheyExpire)
                    .block()
            )
                .as("a lapsed place is given back where it is wanted, not on the sweep's timetable")
                .isNotNull();
        }
    }

    @Test
    void onlyAsManyConversationsAsTheCapAllowsSurviveARaceForThem() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_admission_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "admission-race");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final List<AskAiConversationRepository> writers = repeat(() -> repository(repositories));
            final List<AskAiConversation> opened = Collections.synchronizedList(new ArrayList<>());

            together(
                writers,
                writer -> {
                    final AskAiConversation conversation = writer
                        .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block();
                    if (conversation != null) {
                        opened.add(conversation);
                    }
                }
            );

            assertThat(opened).hasSize(MAX_ACTIVE);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ask_ai_conversation WHERE analysis_id = ?", Integer.class, analysisId
                )
            )
                .as("a conversation refused its place leaves no row behind")
                .isEqualTo(MAX_ACTIVE);
        }
    }

    /** Holds one slot insert open to verify the unique constraint blocks a competing writer. */
    @Test
    void anUncommittedConversationStillHoldsThePlaceItTook() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_staged_commit");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "staged-commit");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);

            try (Connection held = database.dataSource().getConnection()) {
                held.setAutoCommit(false);
                insertHoldingSlot(held, analysisId, now, "staged-first");

                final Future<AskAiConversation> second = inBackground(
                    () -> conversations.createWithinCap(opening(analysisId, now), 1, now).block()
                );

                assertThat(finishedWithin(second, Duration.ofMillis(750)))
                    .as("the second writer waits on the first writer's row rather than counting around it")
                    .isFalse();

                held.commit();

                assertThat(second.get(20, TimeUnit.SECONDS))
                    .as("and is then refused, whatever order the two of them took their ids in")
                    .isNull();
            }

            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ask_ai_conversation WHERE analysis_id = ?", Integer.class, analysisId
                )
            ).isEqualTo(1);
        }
    }

    @Test
    void aPlaceHeldByAWriterThatRollsBackIsGivenToTheOneThatWaitedForIt() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_staged_rollback");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final long analysisId = analysis(database.jdbcTemplate(), "staged-rollback");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);

            try (Connection held = database.dataSource().getConnection()) {
                held.setAutoCommit(false);
                insertHoldingSlot(held, analysisId, now, "rolled-back");

                final Future<AskAiConversation> second = inBackground(
                    () -> conversations.createWithinCap(opening(analysisId, now), 1, now).block()
                );
                assertThat(finishedWithin(second, Duration.ofMillis(750))).isFalse();

                held.rollback();

                assertThat(second.get(20, TimeUnit.SECONDS)).isNotNull();
            }
        }
    }

    @Test
    void aReplyBudgetIsSpentExactlyOnceHoweverManyClaimItAtOnce() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_reply_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "reply-race");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository owner = repository(repositories);
            final long conversationId = owner.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final List<AskAiConversationRepository> writers = repeat(() -> repository(repositories));
            final List<TurnStart> starts = Collections.synchronizedList(new ArrayList<>());
            final List<Integer> writerIndices = new ArrayList<>();
            for (int index = 0; index < writers.size(); index++) {
                writerIndices.add(index);
            }

            together(
                writerIndices,
                index -> starts.add(
                    writers.get(index)
                        .beginTurn(conversationId, BUDGET, turn("cmid-" + index)).block()
                )
            );

            assertThat(starts.stream().filter(TurnStart.Begun.class::isInstance).count()).isEqualTo(REPLY_BUDGET);
            assertThat(starts.stream().filter(TurnStart.NoReplyLeft.class::isInstance).count())
                .isEqualTo(WRITERS - REPLY_BUDGET);
            assertThat(replyCount(jdbc, conversationId)).isEqualTo(REPLY_BUDGET);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(DISTINCT ordinal) FROM ask_ai_message WHERE conversation_id = ?", Integer.class,
                    conversationId
                )
            )
                .as("every begun turn was given a pair of places nothing else was given")
                .isEqualTo(2 * REPLY_BUDGET);
        }
    }

    @Test
    void oneClientMessageIdBeginsOneTurnHoweverManySendItAtOnce() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_duplicate_send");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "duplicate-send");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository owner = repository(repositories);
            final long conversationId = owner.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final List<AskAiConversationRepository> writers = repeat(() -> repository(repositories));
            final List<TurnStart> starts = Collections.synchronizedList(new ArrayList<>());

            together(
                writers, writer -> starts.add(writer.beginTurn(conversationId, BUDGET, turn("same")).block())
            );

            assertThat(starts.stream().filter(TurnStart.Begun.class::isInstance).count()).isEqualTo(1);
            assertThat(starts.stream().filter(TurnStart.AlreadyBegun.class::isInstance).count())
                .isEqualTo(WRITERS - 1);
            assertThat(replyCount(jdbc, conversationId))
                .as("the sends that lost the id spent nothing")
                .isEqualTo(1);
        }
    }

    /** A send racing its own twin for the last reply is a resend to replay, never a conversation out of replies. */
    @Test
    void aDuplicateSendOfTheLastReplyIsToldToReplayNotThatTheRepliesAreSpent() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_duplicate_last");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "duplicate-last");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository owner = repository(repositories);
            final long conversationId = owner.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            for (int answer = 0; answer < REPLY_BUDGET - 1; answer++) {
                final StartedTurn started = begun(
                    owner.beginTurn(conversationId, BUDGET, turn("cmid-answered-" + answer)).block()
                );
                assertThat(owner.settleAnswered(started, ANSWER, EMPTY_BLOCKS, 11).block()).isTrue();
            }
            final List<AskAiConversationRepository> writers = repeat(() -> repository(repositories));
            final List<TurnStart> starts = Collections.synchronizedList(new ArrayList<>());

            together(
                writers, writer -> starts.add(writer.beginTurn(conversationId, BUDGET, turn("last")).block())
            );

            assertThat(starts.stream().filter(TurnStart.Begun.class::isInstance).count()).isEqualTo(1);
            assertThat(starts.stream().filter(TurnStart.AlreadyBegun.class::isInstance).count())
                .isEqualTo(WRITERS - 1);
            assertThat(starts).noneMatch(TurnStart.NoReplyLeft.class::isInstance);
            assertThat(replyCount(jdbc, conversationId)).isEqualTo(REPLY_BUDGET);
        }
    }

    /** Pending-state settlement must allow only one of answer or abandonment to win. */
    @Test
    void anAnswerAndAnAbandonmentOfTheSameTurnCannotBothLand() throws Exception {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_settle_race");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "settle-race");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository owner = repository(repositories);
            final long conversationId = owner.createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final AskAiConversationRepository answering = repository(repositories);
            final AskAiConversationRepository abandoning = repository(repositories);
            final StartedTurn started = begun(owner.beginTurn(conversationId, BUDGET, turn("cmid-race")).block());
            final List<Boolean> settled = Collections.synchronizedList(new ArrayList<>());

            together(
                List.of(
                    (Runnable) () -> settled.add(
                        answering.settleAnswered(started, ANSWER, EMPTY_BLOCKS, 11).block()
                    ),
                    () -> settled.add(
                        abandoning.settleFailed(started, "cancelled", 11).block()
                    )
                ),
                Runnable::run
            );

            assertThat(settled).containsExactlyInAnyOrder(true, false);
            final boolean answered = "validated".equals(outcome(jdbc, started.assistantMessageId()));
            int expectedReplies = 0;
            String expectedClientMessageId = null;
            if (answered) {
                expectedReplies = 1;
                expectedClientMessageId = "cmid-race";
            }
            assertThat(replyCount(jdbc, conversationId))
                .as("the reply is spent if and only if there is an answer to show for it")
                .isEqualTo(expectedReplies);
            assertThat(clientMessageId(jdbc, started.userMessageId()))
                .as("and the send's id stays bound only to an answer a retry can be handed")
                .isEqualTo(expectedClientMessageId);
        }
    }

    @Test
    void aFailedProviderCallGivesItsReplyBack() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_spent_reply");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "spent-reply");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final StartedTurn started = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-spent")).block()
            );

            assertThat(conversations.settleFailed(started, "provider_error", 11).block()).isTrue();
            assertThat(replyCount(jdbc, conversationId))
                .as("a reply is spent on an answer, never on the attempt at one")
                .isEqualTo(0);
            assertThat(clientMessageId(jdbc, started.userMessageId())).isNull();
        }
    }

    @Test
    void aRunOfFailuresEndsAtTheAttemptBudgetWithItsRepliesStillUnspent() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_attempts");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "attempts");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();

            // Every reply comes back, so replies alone would let this go on for ever; the attempts do not.
            for (int attempt = 0; attempt < BUDGET.attempts(); attempt++) {
                final StartedTurn started = begun(
                    conversations.beginTurn(conversationId, BUDGET, turn("cmid-attempt-" + attempt)).block()
                );
                assertThat(conversations.settleFailed(started, "provider_error", 11).block()).isTrue();
            }

            assertThat(conversations.beginTurn(conversationId, BUDGET, turn("cmid-one-too-many")).block())
                .isInstanceOf(TurnStart.NoAttemptLeft.class);
            assertThat(replyCount(jdbc, conversationId)).isEqualTo(0);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ask_ai_message WHERE conversation_id = ?", Integer.class, conversationId
                )
            ).isEqualTo(2 * BUDGET.attempts());
        }
    }

    @Test
    void aConversationOutOfBothIsToldItIsOutOfReplies() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_both_limits");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "both-limits");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();

            for (int failure = 0; failure < FAILED_ATTEMPTS; failure++) {
                final StartedTurn started = begun(
                    conversations.beginTurn(conversationId, BUDGET, turn("cmid-failed-" + failure)).block()
                );
                assertThat(conversations.settleFailed(started, "provider_error", 11).block()).isTrue();
            }
            for (int answer = 0; answer < REPLY_BUDGET; answer++) {
                final StartedTurn started = begun(
                    conversations.beginTurn(conversationId, BUDGET, turn("cmid-answered-" + answer)).block()
                );
                assertThat(conversations.settleAnswered(started, ANSWER, EMPTY_BLOCKS, 11).block()).isTrue();
            }

            assertThat(attemptCount(jdbc, conversationId)).isEqualTo(BUDGET.attempts());
            assertThat(replyCount(jdbc, conversationId)).isEqualTo(REPLY_BUDGET);
            assertThat(conversations.beginTurn(conversationId, BUDGET, turn("cmid-one-more")).block())
                .as("every promised reply was given, which is the limit a reader can be told about honestly")
                .isInstanceOf(TurnStart.NoReplyLeft.class);
        }
    }

    @Test
    void turnsTurnedAwayBeforeTheModelCostNoAttemptHoweverTheyOverlapWithOthers() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_turned_away");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "turned-away");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();

            // Turned away while a later turn is pending, and that later turn then answered, or turned away too.
            final StartedTurn turnedAway = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-turned-away")).block()
            );
            final StartedTurn answered = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-answered")).block()
            );
            assertThat(conversations.discardTurn(turnedAway).block()).isTrue();
            assertThat(conversations.settleAnswered(answered, ANSWER, EMPTY_BLOCKS, 11).block()).isTrue();
            final StartedTurn earlier = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-earlier")).block()
            );
            final StartedTurn later = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-later")).block()
            );
            assertThat(conversations.discardTurn(earlier).block()).isTrue();
            assertThat(conversations.discardTurn(later).block()).isTrue();

            assertThat(replyCount(jdbc, conversationId)).isEqualTo(1);
            assertThat(attemptCount(jdbc, conversationId))
                .as("only the turn that reached the model was an attempt")
                .isEqualTo(1);
            assertThat(
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ask_ai_message WHERE conversation_id = ?", Integer.class, conversationId
                )
            ).isEqualTo(2);

            // So a busy service, however often it turns this conversation away, cannot use it up.
            for (int refusal = 0; refusal < 2 * BUDGET.attempts(); refusal++) {
                final StartedTurn started = begun(
                    conversations.beginTurn(conversationId, BUDGET, turn("cmid-busy-" + refusal)).block()
                );
                assertThat(conversations.discardTurn(started).block()).isTrue();
            }
            begun(conversations.beginTurn(conversationId, BUDGET, turn("cmid-at-last")).block());
        }
    }

    @Test
    void aTurnNothingEverSettledIsGivenBackToTheConversation() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_stale_turn");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "stale-turn");
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final AskAiConversationRepository conversations = repository(repositories);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final StartedTurn abandoned = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-stuck")).block()
            );

            assertThat(conversations.reclaimStalePendingTurns(now.minus(Duration.ofMinutes(15)), 50).block())
                .as("a turn begun a moment ago is not stale")
                .isZero();
            assertThat(replyCount(jdbc, conversationId)).isEqualTo(1);

            assertThat(conversations.reclaimStalePendingTurns(now.plus(Duration.ofHours(1)), 50).block())
                .isEqualTo(1);
            assertThat(replyCount(jdbc, conversationId)).isZero();
            assertThat(outcome(jdbc, abandoned.assistantMessageId())).isEqualTo("abandoned");
            assertThat(clientMessageId(jdbc, abandoned.userMessageId()))
                .as("and the id it was asked under may be asked under again")
                .isNull();
        }
    }

    @Test
    void theSweepClosesWhatIsInvisibleAndDeletesWhatIsDue() {
        try (
            TestDatabase database = TestDatabase.freshSchema("ask_ai_sweep");
            TestRepositories repositories = new TestRepositories(database.migrated())
        ) {
            final JdbcTemplate jdbc = database.jdbcTemplate();
            final long analysisId = analysis(jdbc, "sweep");
            final AskAiConversationRepository conversations = repository(repositories);
            final Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            final long conversationId = conversations
                .createWithinCap(opening(analysisId, now), MAX_ACTIVE, now).block().id();
            final StartedTurn turn = begun(
                conversations.beginTurn(conversationId, BUDGET, turn("cmid-1")).block()
            );
            assertThat(conversations.settleAnswered(turn, ANSWER, EMPTY_BLOCKS, 12).block()).isTrue();

            final Instant pastVisibility = now.plus(Duration.ofDays(8));

            assertThat(conversations.closeExpired(pastVisibility, 50).block()).isEqualTo(1);
            assertThat(state(jdbc, conversationId)).isEqualTo("CLOSED");
            assertThat(activeSlot(jdbc, conversationId))
                .as("a closed conversation holds no place")
                .isNull();
            assertThat(conversations.deletePastRetention(pastVisibility, 50).block())
                .as("the transcript is kept well past the point its reader stops seeing it")
                .isZero();

            final Instant pastRetention = now.plus(Duration.ofDays(31));

            assertThat(conversations.deletePastRetention(pastRetention, 50).block()).isEqualTo(1);
            assertThat(
                jdbc.queryForObject("SELECT COUNT(*) FROM ask_ai_conversation", Integer.class)
            ).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ask_ai_message", Integer.class))
                .as("the messages go with the conversation, not after it")
                .isZero();
        }
    }

    private static StartedTurn begun(final TurnStart start) {
        assertThat(start).isInstanceOf(TurnStart.Begun.class);
        return ((TurnStart.Begun) start).turn();
    }

    private static AskAiConversationRepository.NewTurn turn(final String clientMessageId) {
        return new AskAiConversationRepository.NewTurn("ASK", null, clientMessageId);
    }

    private AskAiConversationRepository repository(final TestRepositories repositories) {
        return new AskAiConversationRepository(
            repositories.of(AskAiConversations.class), repositories.of(AskAiMessages.class),
            ImmediateWork.database(), repositories.transactions()
        );
    }

    private AskAiConversationRepository.NewConversation opening(final long analysisId, final Instant now) {
        return new AskAiConversationRepository.NewConversation(
            submissionOf(analysisId), analysisId, "en", "common", "common:SUMMARISE", "SUMMARISE",
            now.plus(Duration.ofDays(7)), now.plus(Duration.ofDays(30))
        );
    }

    /** Inserts a slot directly so tests can control transaction commits. */
    private void insertHoldingSlot(
        final Connection connection, final long analysisId, final Instant now, final String publicId
    ) throws Exception {
        try (
            PreparedStatement insert = connection.prepareStatement(
                "INSERT INTO ask_ai_conversation (public_id, submission_id, analysis_id, locale, scope_kind, "
                    + "scope_selector, scope_label, user_visible_until, analysis_retain_until, active_slot) "
                    + "VALUES (?, ?, ?, 'en', 'common', 'common:SUMMARISE', 'SUMMARISE', ?, ?, 0)"
            )
        ) {
            insert.setString(1, publicId);
            insert.setLong(2, submissionOf(analysisId));
            insert.setLong(3, analysisId);
            insert.setTimestamp(4, Timestamp.from(now.plus(Duration.ofDays(7))));
            insert.setTimestamp(5, Timestamp.from(now.plus(Duration.ofDays(30))));
            insert.executeUpdate();
        }
    }

    private long submissionOf(final long analysisId) {
        return submissionsByAnalysis.get(analysisId);
    }

    private long analysis(final JdbcTemplate jdbc, final String name) {
        jdbc.update(
            "INSERT INTO submission (share_token, source_type, locale, state, expected_count) "
                + "VALUES (?, 'SCRATCH_PROJECT', 'en', 'COMPLETED', 1)",
            "ask-ai-" + name
        );
        final long submissionId = jdbc.queryForObject(
            "SELECT id FROM submission WHERE share_token = ?", Long.class, "ask-ai-" + name
        );
        jdbc.update(
            "INSERT INTO source_artifact (sha256, storage_key, byte_size, source_kind, retention_state) "
                + "VALUES (?, ?, 1, 'SCRATCH_URL', 'ACTIVE')",
            digest(name), "ask-ai-" + name
        );
        final long artifactId = jdbc.queryForObject(
            "SELECT id FROM source_artifact WHERE storage_key = ?", Long.class, "ask-ai-" + name
        );
        jdbc.update(
            "INSERT INTO analysis (submission_id, source_artifact_id, project_name, provenance, "
                + "report_schema_version, litterbox_artifact_version, locale, status) "
                + "VALUES (?, ?, ?, 'NEW', '1', 'synthetic', 'en', 'DONE')",
            submissionId, artifactId, name
        );
        final long analysisId = jdbc.queryForObject(
            "SELECT id FROM analysis WHERE submission_id = ?", Long.class, submissionId
        );
        submissionsByAnalysis.put(analysisId, submissionId);
        return analysisId;
    }

    private byte[] digest(final String name) {
        final byte[] digest = new byte[32];
        for (int index = 0; index < digest.length; index++) {
            digest[index] = (byte) (name.hashCode() + index);
        }
        return digest;
    }

    private int replyCount(final JdbcTemplate jdbc, final long conversationId) {
        return jdbc.queryForObject(
            "SELECT reply_count FROM ask_ai_conversation WHERE id = ?", Integer.class, conversationId
        );
    }

    private int attemptCount(final JdbcTemplate jdbc, final long conversationId) {
        return jdbc.queryForObject(
            "SELECT attempt_count FROM ask_ai_conversation WHERE id = ?", Integer.class, conversationId
        );
    }

    private String state(final JdbcTemplate jdbc, final long conversationId) {
        return jdbc.queryForObject(
            "SELECT state FROM ask_ai_conversation WHERE id = ?", String.class, conversationId
        );
    }

    private Integer activeSlot(final JdbcTemplate jdbc, final long conversationId) {
        return jdbc.queryForObject(
            "SELECT active_slot FROM ask_ai_conversation WHERE id = ?", Integer.class, conversationId
        );
    }

    private String outcome(final JdbcTemplate jdbc, final long messageId) {
        return jdbc.queryForObject("SELECT outcome FROM ask_ai_message WHERE id = ?", String.class, messageId);
    }

    private String clientMessageId(final JdbcTemplate jdbc, final long messageId) {
        return jdbc.queryForObject(
            "SELECT client_message_id FROM ask_ai_message WHERE id = ?", String.class, messageId
        );
    }

    private <T> List<T> repeat(final Supplier<T> writer) {
        final List<T> writers = new ArrayList<>();
        for (int index = 0; index < WRITERS; index++) {
            writers.add(writer.get());
        }
        return writers;
    }

    /** Releases workers simultaneously for deterministic race tests. */
    private <T> void together(final List<T> writers, final Consumer<T> work) throws Exception {
        final CyclicBarrier start = new CyclicBarrier(writers.size());
        final ExecutorService pool = Executors.newFixedThreadPool(writers.size());
        try {
            final List<Future<?>> running = new ArrayList<>();
            for (final T writer : writers) {
                running.add(pool.submit(() -> {
                    start.await();
                    work.accept(writer);
                    return null;
                }));
            }
            for (final Future<?> future : running) {
                future.get();
            }
        }
        finally {
            pool.shutdownNow();
        }
    }

    private <T> Future<T> inBackground(final Supplier<T> work) throws Exception {
        final CountDownLatch started = new CountDownLatch(1);
        final ExecutorService pool = Executors.newSingleThreadExecutor();
        final Future<T> running = pool.submit(() -> {
            started.countDown();
            return work.get();
        });
        pool.shutdown();
        started.await(10, TimeUnit.SECONDS);
        return running;
    }

    private boolean finishedWithin(final Future<?> running, final Duration patience) throws Exception {
        try {
            running.get(patience.toMillis(), TimeUnit.MILLISECONDS);
            return true;
        }
        catch (java.util.concurrent.TimeoutException stillWaiting) {
            return false;
        }
    }
}
