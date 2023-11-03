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
package de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.services;

import java.util.List;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.ml_preprocessing.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox_web.ml_preprocessing.tokenizer.utils.TokenizerUtils;
import jakarta.annotation.Nonnull;

@Service
public class StatementLevelTokenizerService {

    public StatementLevelTokenizerService() {
    }

    public List<String> tokenize(
        @Nonnull final String jsonProgram,
        @Nonnull final String statementBlockId
    ) {
        MaskingStrategy maskingStrategy = MaskingStrategy.statement(statementBlockId);
        return TokenizerUtils.tokenize(jsonProgram, maskingStrategy, true);
    }

}
