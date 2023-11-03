/*
 * Copyright (C) 2023 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.service;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.shared.ActorNameNormalizer;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.tokenizer.Token;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.tokenizer.TokenizingAnalyzer;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;

@Service
public class TokenizerService {

    private static final Logger log = LoggerFactory.getLogger(TokenizerService.class);

    public List<String> tokenizeMaskingExpression(final Program program, final String expressionBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.expression(expressionBlockId);
        return tokenize(program, maskingStrategy, false);
    }

    public List<String> tokenizeMaskingFixedOption(final Program program, final String parentBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.fixedOption(parentBlockId);
        return tokenize(program, maskingStrategy, false);
    }

    public List<String> tokenizeStatementLevel(final Program program, final String statementBlockId) {
        MaskingStrategy maskingStrategy = MaskingStrategy.statement(statementBlockId);
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
        final TokenizingAnalyzer analyzer = buildAnalyzer(strategy, statementLevel);

        final Optional<List<String>> tokens = analyzer.check(program)
            .flatMap(sequence -> sequence.tokens().stream().findFirst().stream())
            .filter(sequence -> sequence.contains(Token.MASK.getStrRep()))
            .findFirst();

        if (tokens.isPresent()) {
            return tokens.get();
        }
        else {
            log.warn("Tokenizing with strategy {} did not produce any results: {}", strategy, program);
            return Collections.emptyList();
        }
    }

    private TokenizingAnalyzer buildAnalyzer(final MaskingStrategy strategy, final boolean statementLevel) {
        final MLPreprocessorCommonOptions options = new MLPreprocessorCommonOptions(
            null, null, false, true, false, true, true, ActorNameNormalizer.getDefault()
        );

        return new TokenizingAnalyzer(
            options, false, false, statementLevel, strategy
        );
    }
}
