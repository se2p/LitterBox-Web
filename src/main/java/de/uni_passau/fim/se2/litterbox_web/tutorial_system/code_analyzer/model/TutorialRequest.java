/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.model;

import java.util.Locale;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Stores all required data to analyse a SCRATCH program submitted by the tutorial system.
 *
 * @param program   the program represented as JSON submitted as string.
 * @param language  the preferred language for the hints.
 * @param detectors the code patterns that should be checked.
 */
public record TutorialRequest(
    String language,
    String detectors,
    JsonNode program
) {

    /**
     * Converts the SCRATCH program from JSON to String.
     *
     * @return the program as String.
     */
    public String programAsString() {
        return this.program.toString();
    }

    /**
     * Converts the submitted language to {@link Locale}.
     *
     * @return the language as Locale.
     */
    public Locale languageAsLocale() {
        return Locale.of(language);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "(language: " +
            language +
            ", detectors: " +
            detectors +
            ", program: " +
            programAsString() +
            ")";
    }
}
