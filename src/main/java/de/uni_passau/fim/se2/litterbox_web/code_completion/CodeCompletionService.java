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

import java.net.URI;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ml.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.litterbox.ml.shared.ActorNameNormalizer;
import de.uni_passau.fim.se2.litterbox.ml.tokenizer.TokenizingProgramPreprocessor;
import de.uni_passau.fim.se2.litterbox.ml.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import de.uni_passau.fim.se2.litterbox_web.shared.connectors.ExternalApiConnector;
import reactor.core.publisher.Mono;

@Profile(Profiles.CODE_COMPLETION)
@Service
public class CodeCompletionService {

    private final CodeCompletionModelConfig codeCompletionModelConfig;
    private final ExternalApiConnector externalApiConnector;

    public CodeCompletionService(
        final CodeCompletionModelConfig codeCompletionModelConfig,
        final ExternalApiConnector externalApiConnector
    ) {
        this.codeCompletionModelConfig = codeCompletionModelConfig;
        this.externalApiConnector = externalApiConnector;
    }

    /**
     * Requests suggestions for possible next blocks from a code completion model.
     *
     * @param codeCompletionRequest A
     * @return The suggested blocks in descending likelihood order.
     */
    public Mono<CodeCompletionBlocks> getCodeCompletionSuggestions(
        final CodeCompletionRequestDto codeCompletionRequest
    ) {
        final String tokens = tokeniseProgram(codeCompletionRequest.program());
        final CodeCompletionRequest request = new CodeCompletionRequest(
            tokens, "<MASK>", codeCompletionRequest.topkPredictions()
        );
        final URI modelUrl = codeCompletionModelConfig.getModelConfig(codeCompletionRequest.model()).orElseThrow()
            .url();

        return externalApiConnector
            .postEntity(modelUrl, request, CodeCompletionResponse.class)
            .map(this::convertResponse);
    }

    /**
     * Tokenises a program.
     *
     * @param program Some Scratch program.
     * @return The program as sequence of whitespace-separated tokens.
     */
    private String tokeniseProgram(final Program program) {
        // todo: actual tokenisation with masking
        final TokenizingProgramPreprocessor preprocessor = buildPreprocessor(MaskingStrategy.none());
        return preprocessor.processSprites(program)
            .flatMap(tokenSequence -> tokenSequence.tokens().stream().flatMap(Collection::stream))
            .collect(Collectors.joining(" "));
    }

    private TokenizingProgramPreprocessor buildPreprocessor(final MaskingStrategy strategy) {
        final MLPreprocessorCommonOptions options = new MLPreprocessorCommonOptions(
            null, true, true, true, ActorNameNormalizer.getDefault()
        );

        return new TokenizingProgramPreprocessor(
            options, strategy, false, false, false
        );
    }

    private CodeCompletionBlocks convertResponse(final CodeCompletionResponse response) {
        final List<String> blocks = response.predictions().stream()
            .sorted(Comparator.comparing(item -> -1 * item.confidence))
            .map(CodeCompletionPrediction::token)
            .toList();
        return new CodeCompletionBlocks(blocks);
    }

    public record CodeCompletionBlocks(List<String> blockType) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    private record CodeCompletionRequest(String tokens, String maskToken, int topK) {
    }

    private record CodeCompletionResponse(List<CodeCompletionPrediction> predictions) {
    }

    private record CodeCompletionPrediction(String token, double confidence) {
    }
}
