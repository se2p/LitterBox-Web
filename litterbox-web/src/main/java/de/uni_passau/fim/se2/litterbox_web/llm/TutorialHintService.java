/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.llm;

import java.util.Locale;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.ProgramScratchBlocksAnalyzer;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import reactor.core.publisher.Flux;

/**
 * Assembles tutorial hint prompts from a Scratch program and streams the LLM response. Combines the ScratchBlocks
 * conversion and prompt assembly that previously required a separate {@code /converter/scratchblocks} round-trip from
 * the GUI.
 */
@Lazy
@Service
public class TutorialHintService {

    private static final String SYSTEM_PROMPT = """
        You are an assistant for a Scratch debugging learning system (students ~12).
        STRICT OUTPUT:
        - Output ONLY NDJSON. Exactly 5 lines:
          1) {"type":"problemText","value":<string>}
          2) {"type":"solutionOption","id":"A","code":<string>,"isCorrect":true,"explanation":<string>}
          3) {"type":"solutionOption","id":"B","code":<string>,"isCorrect":false,"explanation":<string>}
          4) {"type":"solutionOption","id":"C","code":<string>,"isCorrect":false,"explanation":<string>}
          5) {"type":"done"}
        - Valid JSON per line. No unescaped newlines (use \\n).

        TASK:
        - problemText starts with "Problem:" and describes only the visible wrong behaviour (no hints, no tests, no block names).
        - Generate 3 candidates: exactly ONE fixes the behaviour, TWO are plausible beginner mistakes.
        - Do not break passed behaviours.

        PATCH/SNIPPET MODE (MOST IMPORTANT):
        - Output ONLY the minimal relevant block snippet (not a full script).
        - Do NOT include setup/movement blocks unless they contain the bug or are needed for the fix to make sense.
        - Do NOT add a hat block unless the change is at the very start of a script.
        - Keep as close as possible to the student's code (same structure/names/values).
        - Prefer the fix with the fewest edits.
        - Max 6 lines per option. No comments or "Sprite:" markers.

        CRITICAL SCRATCH SYNTAX (MUST FOLLOW):
        - ALL dropdown values MUST be written as [value v]
        - NEVER write dropdowns as plain text
        - ALL strings MUST be in double quotes
        - NEVER output unquoted text inside ()
        - For touching color [#RRGGBB] ? never add v inside the color brackets, since colors are never dropdowns.
        Examples:
        say ("Hallo")
        switch costume to [normal v]
        stop [all v]

        IMPORTANT FOR STUDENT TEXT:
        - Do NOT mention hex codes, RGB values, or color numbers in explanations.
        - Refer to colors only by simple, descriptive, student-friendly names.

        LANGUAGE:
        - Explanations in LOCALE language.
        - Code in English Scratchblocks text.
        - German wording: "Wiederholungen", "Falls-Bedingung".
        - Explanations: max 2 short sentences, only visible effect.""";

    private final RawLlmService rawLlmService;

    public TutorialHintService(final RawLlmService rawLlmService) {
        this.rawLlmService = rawLlmService;
    }

    /**
     * Converts a Scratch program to ScratchBlocks, assembles the hint prompts, and streams the LLM response.
     *
     * @param program          The parsed Scratch program.
     * @param failedBehaviour  Description of the behaviour the student's code fails.
     * @param passedBehaviours Descriptions of already-passing behaviours (may be null or blank).
     * @param locale           The language for student-facing text.
     * @return A stream of raw SSE data lines from the upstream LLM.
     */
    public Flux<String> stream(
        final Program program,
        final String failedBehaviour,
        final String passedBehaviours,
        final Locale locale
    ) {
        final String scratchBlocks = new ProgramScratchBlocksAnalyzer().analyze(program);
        String passed = "none";
        if (passedBehaviours != null && !passedBehaviours.isBlank()) {
            passed = passedBehaviours;
        }

        final String userPrompt = """
            LOCALE: %s
            STUDENT CODE: %s
            FAILED BEHAVIOUR: %s
            PASSED BEHAVIOURS (do not break): %s""".formatted(
            locale.toLanguageTag(), scratchBlocks, failedBehaviour, passed
        );

        return rawLlmService.stream(SYSTEM_PROMPT, userPrompt);
    }
}
