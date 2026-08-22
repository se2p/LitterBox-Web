/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.qlc;

import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramQuestionAnalyzer;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;

@Service
public class QlcService {

    /**
     * Generates comprehension questions for the given Scratch program.
     *
     * @param program      the Scratch program to analyse.
     * @param locale       locale used for translating question text.
     * @param finderNames  question finders to run; null means all finders.
     * @param dimensions   dimension filter; empty set means all dimensions.
     * @param scopes       scope filter; empty set means all scopes.
     * @param maxQuestions maximum questions to return; 0 means unlimited.
     * @param balanced     whether to balance across block-model cells.
     * @param perCell      questions per cell when balanced; 0 means 1.
     * @param shuffle      whether to shuffle before limiting.
     * @param seed         optional random seed for reproducibility.
     * @return the generated questions as DTOs.
     */
    public List<QuestionDTO> getQuestions(
        final Program program,
        final Locale locale,
        final List<String> finderNames,
        final Set<ProgramDimension> dimensions,
        final Set<ScopeOfFocus> scopes,
        final int maxQuestions,
        final boolean balanced,
        final int perCell,
        final boolean shuffle,
        final Long seed
    ) {
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(locale);
        final ProgramQuestionAnalyzer analyzer = new ProgramQuestionAnalyzer(
            finderNames, translator, dimensions, scopes, maxQuestions, balanced, perCell, shuffle, seed
        );

        return analyzer.analyze(program).stream()
            .map(dto -> convertQuestion(dto, translator))
            .toList();
    }

    private QuestionDTO convertQuestion(
        final de.uni_passau.fim.se2.litterbox.report.QuestionDTO dto,
        final IssueTranslator translator
    ) {
        return new QuestionDTO(
            dto.id(),
            dto.questionType(),
            dto.finder(),
            dto.name(),
            dto.getResolvedQuestionText(translator),
            dto.sprite(),
            dto.scratchBlocksCode(),
            dto.programDimension(),
            dto.scopeOfFocus(),
            dto.getChoices(translator),
            dto.getCorrectAnswers(translator),
            dto.hint()
        );
    }
}
