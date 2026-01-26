/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.embedded_kittens.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.embedded_kittens.shared.ActorNameNormalizer;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.Token;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.TokenizingMethod;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.TokenizingProgramPreprocessor;
import de.uni_passau.fim.se2.embedded_kittens.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;

@Service
public class TokenizerService {

    private static final Logger log = LoggerFactory.getLogger(TokenizerService.class);

    public List<String> tokenizeMaskingBlock(final Program program, final String blockID) {
        MaskingStrategy maskingStrategy = MaskingStrategy.block(blockID);
        return tokenize(program, maskingStrategy, TokenizingMethod.REGULAR);
    }

    public List<String> tokenizeMaskingFixedOption(final Program program, final String parentBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.fixedOption(parentBlockId);
        return tokenize(program, maskingStrategy, TokenizingMethod.REGULAR);
    }

    public List<String> tokenizeStatementLevel(final Program program, final String statementBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.block(statementBlockId);
        return tokenize(program, maskingStrategy, TokenizingMethod.STATEMENT_LEVEL);
    }

    /**
     * Tokenizes the given Scratch program using the specified masking strategy.
     *
     * @param program          The Scratch program to tokenize.
     * @param strategy         The masking strategy.
     * @param tokenizingMethod The type of tokenization that should be applied.
     * @return The token sequence. Empty in case the block that should be masked could not be found.
     */
    private List<String> tokenize(
        final Program program, final MaskingStrategy strategy, final TokenizingMethod tokenizingMethod
    ) {
        final TokenizingProgramPreprocessor preprocessor = buildPreprocessor(strategy, tokenizingMethod);

        final Optional<List<String>> tokens = preprocessor.processSprites(program)
            .flatMap(sequence -> sequence.tokens().stream().findFirst().stream())
            .filter(sequence -> sequence.contains(Token.MASK.getStrRep()))
            .findFirst();

        if (tokens.isPresent()) {
            return tokens.get();
        }
        else {
            log.warn("Tokenizing with strategy (masking={}) did not produce any results.", strategy);
            return Collections.emptyList();
        }
    }

    private TokenizingProgramPreprocessor buildPreprocessor(
        final MaskingStrategy strategy, final TokenizingMethod tokenizingMethod
    ) {
        final MLPreprocessorCommonOptions options = new MLPreprocessorCommonOptions(
            null, true, true, false, ActorNameNormalizer.getDefault()
        );

        return new TokenizingProgramPreprocessor(
            options, strategy, false, tokenizingMethod, false
        );
    }
}
