/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.ask_ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchReference;
import de.uni_passau.fim.se2.litterbox.llm.askai.ScratchTargetCatalogue;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;

final class TargetIndex {

    /** Submission-scoped route rechecks the token before serving costume assets. */
    private static final String ASSET_PATH = "/litterbox/api/v1/submissions/%s/assets/%s";

    private final List<AskAiQuestionsView.Target> views;
    private final String programKey;
    private final Map<String, String> byScript;
    private final Map<String, String> byActor;

    private TargetIndex(
        final List<AskAiQuestionsView.Target> views, final String programKey,
        final Map<String, String> byScript, final Map<String, String> byActor
    ) {
        this.views = List.copyOf(views);
        this.programKey = programKey;
        this.byScript = Map.copyOf(byScript);
        this.byActor = Map.copyOf(byActor);
    }

    static TargetIndex of(
        final ScratchTargetCatalogue catalogue, final Map<String, String> costumeHashes,
        final String submissionToken, final IssueTranslator translator
    ) {
        final List<AskAiQuestionsView.Target> views = new ArrayList<>();
        final Map<String, String> byScript = new LinkedHashMap<>();
        final Map<String, String> byActor = new LinkedHashMap<>();

        final ScratchTargetCatalogue.TargetEntry program = catalogue.program();
        views.add(new AskAiQuestionsView.Target(program.key(), kind(program), "", "", "", null, intents(program)));

        for (final ScratchTargetCatalogue.TargetEntry actor : catalogue.actors()) {
            byActor.put(actor.actorKey(), actor.key());
            views.add(
                new AskAiQuestionsView.Target(
                    actor.key(), kind(actor), actor.actorName(), "", "",
                    thumbnail(submissionToken, costumeHashes.get(actor.actorName())), intents(actor)
                )
            );
        }
        for (final ScratchTargetCatalogue.TargetEntry script : catalogue.scripts()) {
            byScript.put(script.actorKey() + "|" + script.scriptKey(), script.key());
            views.add(
                new AskAiQuestionsView.Target(
                    script.key(), kind(script), trigger(script, translator),
                    byActor.getOrDefault(script.actorKey(), ""), script.scratchblocksPreview(), null,
                    intents(script)
                )
            );
        }
        return new TargetIndex(views, program.key(), byScript, byActor);
    }

    List<AskAiQuestionsView.Target> views() {
        return views;
    }

    String keyFor(final ScratchReference reference) {
        if (reference == null) {
            return programKey;
        }
        if (!reference.scriptKey().isBlank()) {
            final String script = byScript.get(reference.actorKey() + "|" + reference.scriptKey());
            if (script != null) {
                return script;
            }
        }
        if (!reference.actorKey().isBlank()) {
            return byActor.getOrDefault(reference.actorKey(), programKey);
        }
        return programKey;
    }

    private static String kind(final ScratchTargetCatalogue.TargetEntry entry) {
        return entry.kind().name().toLowerCase(Locale.ROOT);
    }

    private static List<String> intents(final ScratchTargetCatalogue.TargetEntry entry) {
        return AskAiQuestionCatalogue.OFFERED_COMMON_QUERIES.stream()
            .filter(entry.allowedIntents()::contains)
            .map(Enum::name)
            .toList();
    }

    private static String trigger(
        final ScratchTargetCatalogue.TargetEntry script, final IssueTranslator translator
    ) {
        if (script.trigger() == null) {
            return "";
        }
        return script.trigger().label().resolve(translator);
    }

    private static String thumbnail(final String submissionToken, final String costumeHash) {
        if (costumeHash == null || costumeHash.isBlank()) {
            return null;
        }
        return ASSET_PATH.formatted(submissionToken, costumeHash);
    }
}
