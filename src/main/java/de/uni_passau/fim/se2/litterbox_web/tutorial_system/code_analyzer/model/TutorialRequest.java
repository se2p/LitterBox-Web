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

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.ScratchProgramConverter;

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
    @JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class) @JsonDeserialize(
        converter = ScratchProgramConverter.DeserializeConverter.class
    ) Program program
) {

    /**
     * Converts the submitted language to {@link Locale}.
     *
     * @return the language as Locale.
     */
    public Locale languageAsLocale() {
        return Locale.of(language);
    }
}
