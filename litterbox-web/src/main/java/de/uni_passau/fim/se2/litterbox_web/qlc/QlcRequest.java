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

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.jspecify.annotations.Nullable;

import de.uni_passau.fim.se2.litterbox.analytics.questions.ProgramDimension;
import de.uni_passau.fim.se2.litterbox.analytics.questions.ScopeOfFocus;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.JsonScratchProgram;

/**
 * Request for generating QLC comprehension questions for a Scratch program.
 *
 * @param language     the preferred language for question text (BCP 47 tag, e.g. "en", "de").
 * @param program      the Scratch program to generate questions for.
 * @param finders      comma-separated question finder names to run; null or blank means all finders.
 * @param dimensions   restrict questions to these program dimensions; empty or null means all dimensions.
 * @param scopes       restrict questions to these scopes of focus; empty or null means all scopes.
 * @param maxQuestions maximum number of questions to return; 0 means unlimited.
 * @param balanced     whether to balance questions across block-model cells (dimension × scope).
 * @param perCell      questions per block-model cell when balanced; 0 uses the default of 1.
 * @param shuffle      whether to shuffle questions before applying the limit.
 * @param seed         optional random seed for reproducible question selection.
 */
public record QlcRequest(
    String language,
    @JsonScratchProgram Program program,
    @Nullable String finders,
    @Nullable Set<ProgramDimension> dimensions,
    @Nullable Set<ScopeOfFocus> scopes,
    int maxQuestions,
    boolean balanced,
    int perCell,
    boolean shuffle,
    @Nullable Long seed
) {

    public QlcRequest {
        if (language == null) {
            language = "en";
        }
        if (dimensions == null) {
            dimensions = Set.of();
        }
        if (scopes == null) {
            scopes = Set.of();
        }
    }

    public QlcRequest(final Program program) {
        this(null, program, null, null, null, 0, false, 0, false, null);
    }

    /**
     * Returns the finder names as a list, or {@code null} if no filter was specified (meaning all finders).
     */
    public @Nullable List<String> finderNames() {
        if (finders == null || finders.isBlank()) {
            return null;
        }
        return Arrays.stream(finders.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toList();
    }

    public Locale languageAsLocale() {
        return Locale.of(language);
    }
}
