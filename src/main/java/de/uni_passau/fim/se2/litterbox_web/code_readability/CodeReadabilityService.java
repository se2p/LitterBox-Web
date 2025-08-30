/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.code_readability;

import java.net.URI;
import java.text.Normalizer;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import de.uni_passau.fim.se2.embedded_kittens.MLPreprocessorCommonOptions;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.TokenSequence;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.TokenizingMethod;
import de.uni_passau.fim.se2.embedded_kittens.tokenizer.TokenizingProgramPreprocessor;
import de.uni_passau.fim.se2.embedded_kittens.util.MaskingStrategy;
import de.uni_passau.fim.se2.litterbox.ast.model.ActorDefinition;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.visitor.ScratchBlocksVisitor;
import de.uni_passau.fim.se2.litterbox_web.screenshot.ScreenshotService;
import de.uni_passau.fim.se2.litterbox_web.shared.Profiles;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.shared.connectors.ExternalApiConnector;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@Profile(Profiles.CODE_READABILITY)
public class CodeReadabilityService {

    private final CodeReadabilityConfig codeReadabilityConfig;
    private final ExternalApiConnector externalApiConnector;
    private final ScreenshotService screenshotService;
    private final Scratch3ParserService scratchParserService;

    private final TokenizingProgramPreprocessor tokenizingPreprocessor;

    public CodeReadabilityService(
        final CodeReadabilityConfig codeReadabilityConfig,
        final ExternalApiConnector externalApiConnector,
        final ScreenshotService screenshotService,
        final Scratch3ParserService scratchParserService
    ) {
        this.codeReadabilityConfig = codeReadabilityConfig;
        this.externalApiConnector = externalApiConnector;
        this.screenshotService = screenshotService;
        this.scratchParserService = scratchParserService;

        this.tokenizingPreprocessor = buildPreprocessor();
    }

    /**
     * Compute the readability of all sprites in the project or a given list of sprites.
     *
     * @param programJSON Scratch Program
     * @param spriteNames Name of the sprites that you want to compute their readability. If not provided, compute all.
     * @return a map of sprite name and its prediction (readable or not) and decision confidence.
     */
    public Mono<Map<String, SpriteReadability>> computeReadability(
        final String programJSON,
        final Optional<Collection<String>> spriteNames
    ) {
        final Program program = scratchParserService.parseFromString(programJSON);

        final Map<String, ActorDefinition> actorDefinitionMap = program.getActorDefinitionList().getDefinitions()
            .stream()
            .collect(
                Collectors.toMap(
                    (ActorDefinition ad) -> Normalizer.normalize(ad.getIdent().getName(), Normalizer.Form.NFC),
                    ad -> ad
                )
            );

        final boolean shouldFilter = spriteNames.isPresent();
        final Collection<String> requestSprites = spriteNames.orElse(Set.of())
            .stream()
            .map(s -> Normalizer.normalize(s, Normalizer.Form.NFC))
            .toList();

        final Map<String, TokenSequence> tokenSequences = tokenizingPreprocessor.processSprites(program)
            .map(
                seq -> new TokenSequence(
                    Normalizer.normalize(seq.label(), Normalizer.Form.NFC),
                    seq.labelSubTokens(),
                    seq.tokens(),
                    seq.subTokens()
                )
            )
            .filter(tokenSequence -> !shouldFilter || requestSprites.contains(tokenSequence.label()))
            .filter(tokenSequence -> !tokenSequence.tokens().isEmpty())
            .collect(Collectors.toUnmodifiableMap(TokenSequence::label, seq -> seq));

        return screenshotService.generateSVGScreenshot(
            new ScreenshotService.ScreenshotRequest(
                programJSON, tokenSequences.keySet(), codeReadabilityConfig.getZoomLevel()
            )
        )
            .map(ScreenshotService.ScreenshotResponse::screenshots)
            .flatMapMany(screenshots -> Flux.fromStream(screenshots.entrySet().stream()))
            .filter(entry -> tokenSequences.containsKey(entry.getKey()))
            .flatMap(entry -> {
                final String spriteName = entry.getKey();
                final String screenshot = entry.getValue();
                final TokenSequence tokenSequence = tokenSequences.get(spriteName);
                return computeReadability(program, actorDefinitionMap, tokenSequence, screenshot);
            })
            .collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    private Mono<Map.Entry<String, SpriteReadability>> computeReadability(
        final Program program,
        final Map<String, ActorDefinition> actorDefinitionMap,
        final TokenSequence tokenSequence,
        final String screenshot
    ) {
        final ActorDefinition actorDefinition = actorDefinitionMap.get(tokenSequence.label());
        final String spriteScratchBlocks = extractSpriteScratchBlocks(actorDefinition, program);

        return computeReadability(
            new CodeReadabilityRequest(tokenSequence.tokens(), screenshot, spriteScratchBlocks)
        ).map(readability -> Map.entry(tokenSequence.label(), readability));
    }

    /**
     * Compute readability internally by making a request to readability connector.
     *
     * @param request Readability request.
     * @return The prediction (readable or not) and the decision confidence.
     */
    private Mono<SpriteReadability> computeReadability(final CodeReadabilityRequest request) {
        final URI url = UriComponentsBuilder.fromUri(codeReadabilityConfig.getUrl())
            .path("/code-readability")
            .build().toUri();

        return externalApiConnector
            .postEntity(url, request, SpriteReadability.class);
    }

    /**
     * Get the ScratchBlocks of a given sprite.
     *
     * @param actorDefinition Sprite definition.
     * @param program         The program the actor belongs to.
     * @return The ScratchBlocks of the given sprite.
     */
    private String extractSpriteScratchBlocks(final ActorDefinition actorDefinition, final Program program) {
        ScratchBlocksVisitor scratchBlocksVisitor = new ScratchBlocksVisitor();
        scratchBlocksVisitor.setProgram(program);
        scratchBlocksVisitor.visit(actorDefinition);
        return scratchBlocksVisitor.getScratchBlocks();
    }

    private TokenizingProgramPreprocessor buildPreprocessor() {
        final MLPreprocessorCommonOptions options = new MLPreprocessorCommonOptions(
            null, false, true, true,
            // Not normalize sprite name for retrieving later
            actor -> Optional.ofNullable(actor.getIdent().getName())
        );

        return new TokenizingProgramPreprocessor(
            options, MaskingStrategy.none(), false, TokenizingMethod.REGULAR, true
        );
    }

    public record CodeReadabilityRequest(
        List<List<String>> tokens,
        String svg,
        String scratchblocks
    ) {

        public CodeReadabilityRequest {
            Objects.requireNonNull(svg);
        }
    }

    public record SpriteReadability(boolean readable, double confidence) {
    }
}
