/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ml.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.litterbox.ml.shared.ActorNameNormalizer;
import de.uni_passau.fim.se2.litterbox.ml.tokenizer.Token;
import de.uni_passau.fim.se2.litterbox.ml.tokenizer.TokenizingProgramPreprocessor;
import de.uni_passau.fim.se2.litterbox.ml.util.MaskingStrategy;

@Service
public class TokenizerService {

    private static final Logger log = LoggerFactory.getLogger(TokenizerService.class);

    public List<String> tokenizeMaskingBlock(final Program program, final String blockID) {
        MaskingStrategy maskingStrategy = MaskingStrategy.block(blockID);
        return tokenize(program, maskingStrategy, false);
    }

    public List<String> tokenizeMaskingFixedOption(final Program program, final String parentBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.fixedOption(parentBlockId);
        return tokenize(program, maskingStrategy, false);
    }

    public List<String> tokenizeStatementLevel(final Program program, final String statementBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.block(statementBlockId);
        return tokenize(program, maskingStrategy, true);
    }

    /**
     * Tokenizes the given Scratch program using the specified masking strategy.
     *
     * @param program        The Scratch program to tokenize.
     * @param strategy       The masking strategy.
     * @param statementLevel True if only statement level tokens should be returned.
     * @return The token sequence. Empty in case the block that should be masked could not be found.
     */
    private List<String> tokenize(final Program program, final MaskingStrategy strategy, final boolean statementLevel) {
        final TokenizingProgramPreprocessor preprocessor = buildPreprocessor(strategy, statementLevel);

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
        final MaskingStrategy strategy, final boolean statementLevel
    ) {
        final MLPreprocessorCommonOptions options = new MLPreprocessorCommonOptions(
            null, true, true, false, ActorNameNormalizer.getDefault()
        );

        return new TokenizingProgramPreprocessor(
            options, strategy, false, statementLevel, false
        );
    }
}
