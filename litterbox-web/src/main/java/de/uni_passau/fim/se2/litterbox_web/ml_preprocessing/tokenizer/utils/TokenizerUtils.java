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
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.utils;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.slf4j.LoggerFactory;

import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.shared.ActorNameNormalizer;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.tokenizer.Token;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.tokenizer.TokenizingAnalyzer;
import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import jakarta.annotation.Nonnull;

public final class TokenizerUtils {

    private static final org.slf4j.Logger log = LoggerFactory.getLogger(TokenizerUtils.class);

    public static final Scratch3Parser PARSER = new Scratch3Parser();

    private TokenizerUtils() {
    }

    /**
     * Tokenizes the given Scratch program using the specified masking strategy. The resulting sequence of tokens will
     * only contain statement tokens iff {@code statementLevel} is true.
     *
     * @param jsonProgram     the Scratch program to tokenize (as JSON string)
     * @param maskingStrategy the masking strategy to use
     * @param statementLevel  whether only statement tokens should be returned
     * @return the token sequence
     */
    public static List<String> tokenize(
        @Nonnull final String jsonProgram, @Nonnull final MaskingStrategy maskingStrategy, final boolean statementLevel
    ) {
        try {
            TokenizingAnalyzer analyzer = new TokenizingAnalyzer(
                new MLPreprocessorCommonOptions(
                    null, null, false, true,
                    false, true, true, ActorNameNormalizer.getDefault()
                ),
                false,
                false,
                statementLevel,
                maskingStrategy
            );

            Program program = PARSER.parseString("tmp", jsonProgram);
            Optional<List<String>> maskedTokenSequence = analyzer.check(program)
                .map(sequence -> sequence.tokens().stream().findFirst().get())
                .filter(sequence -> sequence.contains(Token.MASK.getStrRep()))
                .findFirst();

            if (maskedTokenSequence.isPresent()) {
                return maskedTokenSequence.get();
            }

            log.warn("Masking \"{}\" was not performed on a program", maskingStrategy.getMaskingType());
            return Collections.emptyList();
        }
        catch (Exception e) {
            log.warn("Tokenization with masking \"{}\" failed", maskingStrategy.getMaskingType(), e);
            return Collections.emptyList();
        }
    }
}
