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

import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiListingOptions;
import de.uni_passau.fim.se2.litterbox.llm.askai.AskAiQuestionService;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetCatalogueBuilder;
import de.uni_passau.fim.se2.litterbox.llm.askai.inquiry.ScratchInquiryAnalyzer;
import de.uni_passau.fim.se2.litterbox.llm.prompts.CommonQuery;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslatorFactory;
import reactor.core.publisher.Mono;

@Service
public final class AskAiQuestionCatalogue {

    /** Duplicated from ApiV1 to avoid a module dependency. */
    static final List<String> SUPPORTED_LOCALES = List.of("de", "en", "es", "nl");

    static final int SCHEMA_VERSION = 1;

    /**
     * Offered intents in display order; excludes model praise about learners and bug-finding handled by core finders.
     */
    static final List<CommonQuery> OFFERED_COMMON_QUERIES = List.of(
        CommonQuery.SUMMARISE, CommonQuery.EXPLAIN, CommonQuery.SUGGEST_EXTENSION, CommonQuery.PROVIDE_FEEDBACK
    );

    private final AskAiProgramLoader loader;
    private final AskAiConfigurationProperties configuration;
    private final AskAiQuestionService questionService = new AskAiQuestionService(
        new ScratchInquiryAnalyzer(), new ScratchTargetCatalogueBuilder()
    );

    public AskAiQuestionCatalogue(final AskAiProgramLoader loader, final AskAiConfigurationProperties configuration) {
        this.loader = Objects.requireNonNull(loader, "loader");
        this.configuration = Objects.requireNonNull(configuration, "configuration");
    }

    /**
     * Authorizes the context before locale validation to avoid revealing whether it exists.
     *
     * @param submissionToken token proving access to the submission
     * @param analysisId      analysis whose questions are requested
     * @param locale          requested question locale
     * @return the bounded question catalogue
     */
    public Mono<AskAiQuestionsView> questions(
        final String submissionToken, final long analysisId, final String locale
    ) {
        return loader.authorize(submissionToken, analysisId)
            .flatMap(
                authorized -> requireSupportedLocale(locale).then(loader.loadProject(authorized))
                    .map(loaded -> buildView(loaded, submissionToken, locale))
            )
            .onErrorMap(AskAiProgramLoader::mapContextFailure);
    }

    static Mono<Void> requireSupportedLocale(final String locale) {
        if (locale == null || !SUPPORTED_LOCALES.contains(locale)) {
            return Mono.error(new IllegalArgumentException("Unsupported locale"));
        }
        return Mono.empty();
    }

    private AskAiQuestionsView buildView(
        final AskAiProgramLoader.LoadedProject loaded, final String submissionToken, final String locale
    ) {
        final IssueTranslator translator = IssueTranslatorFactory.getIssueTranslator(Locale.of(locale));
        final AskAiListingOptions options = new AskAiListingOptions(
            locale, null, configuration.getListing().getMaxInquiries(),
            configuration.getListing().getMaxFindings(), null, null, false
        );
        final AskAiQuestionService.ProjectQuestions result = questionService.questions(loaded.program(), options);
        final TargetIndex targets = TargetIndex.of(
            result.catalogue(), loaded.costumeHashes(), submissionToken,
            translator
        );
        final List<AskAiQuestionsView.Inquiry> inquiries = result.inquiries().stream().map(
            inquiry -> new AskAiQuestionsView.Inquiry(
                inquiry.selector(), inquiry.kind().selectorName(), inquiry.question().resolve(translator),
                targets.keyFor(inquiry.focus())
            )
        ).toList();
        final List<AskAiQuestionsView.Finding> findings = result.findings().stream().map(
            finding -> new AskAiQuestionsView.Finding(
                finding.selector(), finding.description(), family(finding.type()),
                targets.keyFor(finding.location()), finding.finder(), finding.markedCode()
            )
        ).toList();
        return AskAiListingBounds.withinBytes(
            new AskAiQuestionsView(SCHEMA_VERSION, inquiries, findings, targets.views(), result.truncated(), false)
        );
    }

    /** {@code type} is an {@code IssueType} name; {@code FIX} and anything new fall under "other". */
    private static String family(final String type) {
        return switch (type) {
            case "BUG" -> "bug";
            case "SMELL" -> "smell";
            case "PERFUME" -> "perfume";
            case null, default -> "other";
        };
    }
}
