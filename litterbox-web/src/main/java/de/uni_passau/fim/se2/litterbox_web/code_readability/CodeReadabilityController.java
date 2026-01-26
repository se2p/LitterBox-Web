/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@Profile(Profiles.CODE_READABILITY)
@RestController
@RequestMapping("code-readability")
public class CodeReadabilityController {

    private final CodeReadabilityService codeReadabilityService;

    public CodeReadabilityController(final CodeReadabilityService codeReadabilityService) {
        this.codeReadabilityService = codeReadabilityService;
    }

    @PostMapping(value = "")
    public Mono<Map<String, CodeReadabilityService.SpriteReadability>> computeCodeReadability(
        @RequestBody @Valid final CodeReadabilityRequestDto requestDto
    ) {
        return codeReadabilityService.computeReadability(requestDto.program(), requestDto.spriteNames());
    }
}
