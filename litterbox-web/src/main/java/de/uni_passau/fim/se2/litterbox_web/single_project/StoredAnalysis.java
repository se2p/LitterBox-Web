/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * An analysis as it was written down, which is what every later reading of it starts from. Stored as JSON against the
 * analysis row, so a result survives a restart and can be read back without the project being analysed again.
 *
 * Every collection is copied on the way in: a stored report is a fact about what happened, and nothing that hands one
 * out should be able to have it altered underneath.
 */
record StoredAnalysis(
    String name,
    Map<String, Double> metrics,
    List<StoredIssue> issues,
    List<SingleProjectDtos.RelationshipView> relationships,
    List<SingleProjectDtos.CatalogueView> catalogue,
    List<SingleProjectDtos.QuizView> quiz,
    List<QuizAnswerMarking.StoredQuizQuestion> quizAnswerKeys,
    List<String> assetHashes
) {

    StoredAnalysis {
        metrics = metrics == null ? Map.of() : Collections.unmodifiableMap(new TreeMap<>(metrics));
        issues = issues == null ? List.of() : List.copyOf(issues);
        relationships = relationships == null ? List.of() : List.copyOf(relationships);
        catalogue = catalogue == null ? List.of() : List.copyOf(catalogue);
        quiz = quiz == null ? List.of() : List.copyOf(quiz);
        quizAnswerKeys = quizAnswerKeys == null ? List.of() : List.copyOf(quizAnswerKeys);
        assetHashes = assetHashes == null ? List.of() : List.copyOf(assetHashes);
    }

    /** What an analysis that recorded nothing reads as, so a caller never has to test for absence. */
    static StoredAnalysis empty() {
        return new StoredAnalysis(null, Map.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }
}
