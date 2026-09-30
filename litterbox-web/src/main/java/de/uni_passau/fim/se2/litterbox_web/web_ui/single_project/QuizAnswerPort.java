/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import reactor.core.publisher.Mono;

@Component
public final class QuizAnswerPort {

    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;
    private final QlcService qlc;
    private final SingleProjectReportMapper reports = new SingleProjectReportMapper();

    public QuizAnswerPort(
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final QlcService qlc
    ) {
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.analysisWork = Objects.requireNonNull(analysisWork, "analysisWork");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.archiveInspector = Objects.requireNonNull(archiveInspector, "archiveInspector");
        this.qlc = Objects.requireNonNull(qlc, "qlc");
    }

    /**
     * The analysis's generated questions together with their answer keys, read from one parse of the report.
     *
     * @param analysis the completed analysis whose stored report holds the quiz
     * @return the stored quiz questions with an answer key for each; keys missing from older reports are regenerated
     *         from the stored project
     */
    public Mono<GeneratedQuiz> generatedQuiz(final Analysis analysis) {
        final StoredAnalysis stored = reports.storedAnalysis(analysis);
        if (stored.quiz().isEmpty() || hasAllAnswerKeys(stored)) {
            return Mono.just(new GeneratedQuiz(stored.quiz(), toAnswerKeyQuestions(stored.quizAnswerKeys())));
        }
        return regeneratedQuestions(analysis).map(
            questions -> new GeneratedQuiz(
                stored.quiz(), toAnswerKeyQuestions(regeneratedAnswerKeys(stored, questions))
            )
        );
    }

    public Mono<List<SingleProjectDtos.QuizAnswerKeyQuestion>> answerKey(final Analysis analysis) {
        return generatedQuiz(analysis).map(GeneratedQuiz::answerKeys);
    }

    private static List<SingleProjectDtos.QuizAnswerKeyQuestion> toAnswerKeyQuestions(
        final List<QuizAnswerMarking.StoredQuizQuestion> keys
    ) {
        return keys.stream()
            .map(key -> new SingleProjectDtos.QuizAnswerKeyQuestion(key.questionId(), key.correctAnswers()))
            .toList();
    }

    private static boolean hasAllAnswerKeys(final StoredAnalysis stored) {
        return stored.quiz().stream().allMatch(
            question -> stored.quizAnswerKeys().stream()
                .anyMatch(key -> question.questionId().equals(key.questionId()))
        );
    }

    private static List<QuizAnswerMarking.StoredQuizQuestion> regeneratedAnswerKeys(
        final StoredAnalysis stored, final List<QuestionDTO> questions
    ) {
        return stored.quiz().stream().map(saved -> regeneratedAnswerKey(saved, questions)).toList();
    }

    private static QuizAnswerMarking.StoredQuizQuestion regeneratedAnswerKey(
        final SingleProjectDtos.QuizView saved, final List<QuestionDTO> questions
    ) {
        final QuizAnswerMarking.StoredQuizQuestion answerKey = questions.stream()
            .filter(candidate -> Integer.toString(candidate.id()).equals(saved.questionId()))
            .findFirst()
            .map(QuizAnswerMarking::storedQuizQuestion)
            .orElseThrow(
                () -> new QuizAnswerMarking.InvalidQuizAnswerException(
                    "The regenerated quiz no longer matches the saved analysis"
                )
            );
        validateRegeneratedQuestion(saved, answerKey);
        return answerKey;
    }

    private static void validateRegeneratedQuestion(
        final SingleProjectDtos.QuizView saved, final QuizAnswerMarking.StoredQuizQuestion answerKey
    ) {
        QuizAnswerMarking.validateStoredQuestion(saved, answerKey);
        if (saved.questionType() != null && !Objects.equals(saved.questionType(), typeName(answerKey.type()))) {
            throw new QuizAnswerMarking.InvalidQuizAnswerException(
                "Quiz question does not match the saved analysis"
            );
        }
    }

    private static String typeName(final QuestionType type) {
        if (type == null) {
            return null;
        }
        return type.name();
    }

    /**
     * Marks a learner's answer to one question of an analysis's generated quiz.
     *
     * @param analysisId the analysis whose quiz the question belongs to
     * @param questionId the quiz question being answered
     * @param answer     the learner's answer
     * @return whether the answer is correct, together with the accepted answers; fails with
     *         {@link AnalysisNotFoundException} for an unknown analysis and {@link UnmarkableAnswerException} when the
     *         question or answer cannot be marked
     */
    public Mono<Verdict> mark(final long analysisId, final String questionId, final String answer) {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(answer, "answer");
        return requireAnalysis(analysisId)
            .flatMap(analysis -> markForAnalysis(analysis, questionId, answer))
            .onErrorMap(
                QuizAnswerMarking.InvalidQuizAnswerException.class,
                error -> new UnmarkableAnswerException(error.getMessage())
            );
    }

    private Mono<Verdict> markForAnalysis(
        final Analysis analysis, final String questionId, final String answer
    ) {
        final StoredAnalysis stored = reports.storedAnalysis(analysis);
        final SingleProjectDtos.QuizView generatedQuestion = stored.quiz().stream()
            .filter(question -> questionId.equals(question.questionId()))
            .findFirst()
            .orElseThrow(() -> new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question"));
        final QuizAnswerMarking.StoredQuizQuestion answerKey = stored.quizAnswerKeys().stream()
            .filter(question -> questionId.equals(question.questionId()))
            .findFirst()
            .orElse(null);
        if (answerKey != null) {
            return Mono.just(evaluate(generatedQuestion, answerKey, answer));
        }
        if (!questionId.matches("[1-9][0-9]{0,8}")) {
            return Mono.error(new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question"));
        }
        final int numericQuestionId = Integer.parseInt(questionId);
        return regeneratedQuestions(analysis).map(
            questions -> evaluate(generatedQuestion, regeneratedQuestion(questions, numericQuestionId), answer)
        );
    }

    private static QuizAnswerMarking.StoredQuizQuestion regeneratedQuestion(
        final List<QuestionDTO> questions, final int questionId
    ) {
        return QuizAnswerMarking.storedQuizQuestion(
            questions.stream()
                .filter(candidate -> candidate.id() == questionId)
                .findFirst()
                .orElseThrow(() -> new QuizAnswerMarking.InvalidQuizAnswerException("Unknown quiz question"))
        );
    }

    private static Verdict evaluate(
        final SingleProjectDtos.QuizView generatedQuestion,
        final QuizAnswerMarking.StoredQuizQuestion answerKey,
        final String answer
    ) {
        QuizAnswerMarking.validateStoredQuestion(generatedQuestion, answerKey);
        QuizAnswerMarking.validateQuizAnswer(answerKey, answer);
        return QuizAnswerMarking.evaluation(answerKey, answer);
    }

    /**
     * Marks an answer against a question snapshot that was frozen when an assessment was published.
     *
     * @param type           the question type, which decides how the answer is compared
     * @param choices        the choices offered to the learner
     * @param correctAnswers the answers accepted as correct
     * @param answer         the learner's answer
     * @return whether the answer is correct, together with the accepted answers
     */
    public static Verdict markSnapshot(
        final QuestionType type, final List<String> choices, final List<String> correctAnswers, final String answer
    ) {
        final QuizAnswerMarking.StoredQuizQuestion snapshot = new QuizAnswerMarking.StoredQuizQuestion(
            "", type, "", choices, correctAnswers
        );
        QuizAnswerMarking.validateQuizAnswer(snapshot, answer);
        return QuizAnswerMarking.evaluation(snapshot, answer);
    }

    private Mono<Analysis> requireAnalysis(final long analysisId) {
        return analyses.findById(analysisId).switchIfEmpty(Mono.error(new AnalysisNotFoundException(analysisId)));
    }

    /** Regenerates questions for reports stored before answer keys. */
    private Mono<List<QuestionDTO>> regeneratedQuestions(final Analysis analysis) {
        return sourceArtifacts.findForAnalysis(analysis)
            .switchIfEmpty(Mono.error(new AnalysisNotFoundException(analysis.id())))
            .flatMap(
                artifact -> sourceArtifacts.open(artifact.sha256()).flatMap(
                    stream -> regenerateFrom(stream, artifact.originalFilename(), analysis)
                )
            );
    }

    private Mono<List<QuestionDTO>> regenerateFrom(
        final InputStream stream, final String filename, final Analysis analysis
    ) {
        return Mono.using(
            () -> stream,
            owned -> analysisWork.submit(
                () -> regenerate(
                    SingleProjectSupport.readLimited(owned, SingleProjectSupport.MAX_PROJECT_BYTES),
                    filename, analysis
                )
            ),
            SingleProjectSupport::closeQuietly
        );
    }

    private List<QuestionDTO> regenerate(final byte[] bytes, final String filename, final Analysis analysis)
        throws IOException {
        final Program program = SingleProjectSupport
            .parseStoredProgram(parser, archiveInspector, bytes, filename, analysis.inputFormat());
        return SingleProjectSupport.generateQuestions(qlc, program, analysis.locale());
    }

    public record GeneratedQuiz(
        List<SingleProjectDtos.QuizView> questions, List<SingleProjectDtos.QuizAnswerKeyQuestion> answerKeys
    ) {

        public static final GeneratedQuiz NONE = new GeneratedQuiz(List.of(), List.of());

        public GeneratedQuiz {
            questions = List.copyOf(questions);
            answerKeys = List.copyOf(answerKeys);
        }
    }

    public record Verdict(boolean correct, List<String> correctAnswers) {

        public Verdict {
            correctAnswers = List.copyOf(correctAnswers);
        }
    }

    public static final class AnalysisNotFoundException extends RuntimeException {

        public AnalysisNotFoundException(final long analysisId) {
            super("Analysis not found: " + analysisId);
        }
    }

    public static final class UnmarkableAnswerException extends RuntimeException {

        public UnmarkableAnswerException(final String message) {
            super(message);
        }
    }
}
