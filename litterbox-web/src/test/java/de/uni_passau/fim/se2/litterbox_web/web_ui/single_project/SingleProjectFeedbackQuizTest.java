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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.QuestionType;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisJobRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AssetRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackReaction;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.IssueFeedbackRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.QuizAnswerRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SingleProjectSubmissionService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionEventRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import reactor.core.publisher.Mono;

class SingleProjectFeedbackQuizTest {

    private static final String FINDER_ID = "finder-one";
    private static final String CHOICE_B = "B";
    private static final String QUESTION_ID = "1";
    private static final String REPORT_SCHEMA_VERSION = "1";

    @Test
    void acceptsOnlyKnownFindersAndApprovedReactions() {
        final IssueFeedbackRepository feedback = mock(IssueFeedbackRepository.class);
        final SingleProjectApplicationService service = service(
            analysisWithReport(), feedback, mock(QuizAnswerRepository.class), mock(AnalysisWork.class)
        );
        when(feedback.upsert(41, FINDER_ID, IssueFeedbackReaction.HELPFUL)).thenReturn(Mono.empty());
        when(feedback.upsert(41, FINDER_ID, IssueFeedbackReaction.NOT_HELPFUL)).thenReturn(Mono.empty());

        service.feedback(41, new SingleProjectDtos.FeedbackRequest(FINDER_ID, "helpful")).block();
        service.feedback(41, new SingleProjectDtos.FeedbackRequest(FINDER_ID, "not-helpful")).block();

        verify(feedback).upsert(41, FINDER_ID, IssueFeedbackReaction.HELPFUL);
        verify(feedback).upsert(41, FINDER_ID, IssueFeedbackReaction.NOT_HELPFUL);
        assertThatThrownBy(
            () -> service.feedback(41, new SingleProjectDtos.FeedbackRequest(FINDER_ID, "unknown")).block()
        ).isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Invalid feedback reaction");
        // A reaction the enum does not name is refused before the repository is reached, so the two calls above are
        // still the only two.
        verify(feedback, times(2)).upsert(eq(41L), eq(FINDER_ID), any());
        assertThatThrownBy(
            () -> service.feedback(41, new SingleProjectDtos.FeedbackRequest("missing", "helpful")).block()
        ).isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Unknown finder id");
    }

    @Test
    void validatesGeneratedQuizChoicesAndPersistsServerComputedCorrectness() throws Exception {
        final QuizAnswerRepository answers = mock(QuizAnswerRepository.class);
        final AnalysisWork analysisWork = mock(AnalysisWork.class);
        final Scratch3ParserService parser = mock(Scratch3ParserService.class);
        final ProjectArchiveInspector inspector = mock(ProjectArchiveInspector.class);
        final QlcService qlc = mock(QlcService.class);
        final SourceArtifactAccess sourceArtifacts = mock(SourceArtifactAccess.class);
        final Program program = mock(Program.class);
        final QuestionDTO question = new QuestionDTO(
            1, QuestionType.MULTIPLE_CHOICE, FINDER_ID, "Synthetic question", "Choose B", "Stage", "",
            ProgramDimension.TEXT, ScopeOfFocus.ATOM, List.of("A", CHOICE_B), List.of(CHOICE_B), null
        );
        final Analysis analysis = analysisWithReport();
        final SourceArtifact artifact = new SourceArtifact(9, new byte[32], 1, "application/zip", "synthetic.sb3");
        when(parser.parseFromFile(any(Path.class))).thenReturn(program);
        when(inspector.inspect(any())).thenReturn(new ProjectArchiveInspector.Inspection(new byte[0], List.of()));
        // Regenerating a report that predates stored answer keys has to ask for the same set the report was built from.
        when(qlc.getQuestions(any(), any(), any(), any(), any(), eq(300), eq(false), eq(0), eq(false), eq(0L)))
            .thenReturn(Stream.of(question));
        when(sourceArtifacts.findForAnalysis(argThat(read -> read != null && read.sourceArtifactId() == 9)))
            .thenReturn(Mono.just(artifact));
        when(sourceArtifacts.open(any())).thenReturn(Mono.just(new ByteArrayInputStream(new byte[] { 1 })));
        when(answers.record(eq(41L), eq(QUESTION_ID), eq(CHOICE_B), eq(true))).thenReturn(Mono.empty());
        doAnswer(invocation -> runCallable(invocation.getArgument(0))).when(analysisWork).submit(any());

        final SingleProjectApplicationService service = service(
            analysis, mock(IssueFeedbackRepository.class), answers,
            analysisWork, parser, inspector, qlc, sourceArtifacts
        );
        final SingleProjectDtos.QuizAnswerResult verdict = service
            .quizAnswer(41, new SingleProjectDtos.QuizAnswerRequest(QUESTION_ID, CHOICE_B)).block();
        assertThat(verdict).isNotNull();
        assertThat(verdict.correct()).isTrue();
        assertThat(verdict.correctAnswers()).containsExactly(CHOICE_B);
        verify(answers).record(41, QUESTION_ID, CHOICE_B, true);
        verify(analysisWork, never()).submit(any());

        assertThatThrownBy(
            () -> service.quizAnswer(41, new SingleProjectDtos.QuizAnswerRequest(QUESTION_ID, "C")).block()
        ).isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Invalid quiz answer");
        verify(answers, never()).record(41, QUESTION_ID, "C", false);

        assertThatThrownBy(
            () -> service.quizAnswer(41, new SingleProjectDtos.QuizAnswerRequest("2", CHOICE_B)).block()
        ).isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("Invalid quiz answer");
    }

    @Test
    void enforcesStandaloneReportOutputLimit() throws Exception {
        final BoundedReportOutput output = new BoundedReportOutput(4);

        output.write("12345".getBytes(StandardCharsets.UTF_8));

        assertThat(output.exceeded()).isTrue();
        assertThat(output.toByteArray()).containsExactly("1234".getBytes(StandardCharsets.UTF_8));
    }

    private SingleProjectApplicationService service(
        final Analysis analysis,
        final IssueFeedbackRepository feedback,
        final QuizAnswerRepository answers,
        final AnalysisWork analysisWork
    ) {
        return service(
            analysis, feedback, answers, analysisWork, mock(Scratch3ParserService.class),
            mock(ProjectArchiveInspector.class), mock(QlcService.class), mock(SourceArtifactAccess.class)
        );
    }

    private SingleProjectApplicationService service(
        final Analysis analysis,
        final IssueFeedbackRepository feedback,
        final QuizAnswerRepository answers,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector inspector,
        final QlcService qlc,
        final SourceArtifactAccess sourceArtifacts
    ) {
        final AnalysisRepository analyses = mock(AnalysisRepository.class);
        when(analyses.findById(41)).thenReturn(Mono.just(analysis));
        return new SingleProjectApplicationService(
            mock(SingleProjectSubmissionService.class), mock(SubmissionRepository.class),
            mock(SubmissionEventRepository.class), analyses, mock(AnalysisJobRepository.class), sourceArtifacts,
            mock(AssetRepository.class), feedback, answers, analysisWork, parser, mock(ScratchProjectClient.class),
            qlc, inspector, mock(TeacherBatchArchiveInspector.class), "synthetic"
        );
    }

    private Analysis analysisWithReport() {
        return new Analysis(
            41, 7, 9, "synthetic.sb3", "NEW", REPORT_SCHEMA_VERSION, "synthetic", "en", "DONE", ".sb3",
            "{\"name\":\"synthetic.sb3\",\"metrics\":{},\"issues\":[{\"id\":1,"
                + "\"finderId\":\"finder-one\",\"finderName\":\"Synthetic Finder\",\"severity\":1,"
                + "\"currentCostume\":0}],"
                + "\"relationships\":[],\"catalogue\":[],\"quiz\":[{\"questionId\":\"1\","
                + "\"question\":\"Choose B\",\"options\":[\"A\",\"B\"]}],"
                + "\"quizAnswerKeys\":[{\"questionId\":\"1\",\"type\":\"MULTIPLE_CHOICE\","
                + "\"question\":\"Choose B\",\"choices\":[\"A\",\"B\"],"
                + "\"correctAnswers\":[\"B\"]}],\"assetHashes\":[]}",
            null, null, "all", "{}", new byte[32], Map.of()
        );
    }

    private Mono<Object> runCallable(final Callable<?> callable) {
        try {
            return Mono.justOrEmpty(callable.call());
        }
        catch (Exception error) {
            return Mono.error(error);
        }
    }
}
