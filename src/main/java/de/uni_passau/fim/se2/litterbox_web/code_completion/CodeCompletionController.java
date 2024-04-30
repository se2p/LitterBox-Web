/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_completion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import jakarta.annotation.PostConstruct;

@Profile(Profiles.CODE_COMPLETION)
@RestController
public class CodeCompletionController {

    private static final Logger log = LoggerFactory.getLogger(CodeCompletionController.class);

    private final CodeCompletionModelConfig modelConfig;

    public CodeCompletionController(final CodeCompletionModelConfig modelConfig) {
        this.modelConfig = modelConfig;
    }

    @PostConstruct
    public void doNothing() {
        log.info("Config: {}", modelConfig);
    }
}
