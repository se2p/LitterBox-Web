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

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import tools.jackson.databind.json.JsonMapper;

/**
 * Keeps a question listing within what the browser will read.
 *
 * <p>
 * The browser refuses a listing over 4 MiB, and a project of a thousand long scripts would run past that on script
 * previews alone. The previews are the one part of the listing that is decoration: a script listed without its code is
 * still there to be asked about. So they are what gives way, in listing order, until the whole serialized listing fits
 * — measured in the bytes the browser will count, since a preview full of {@code é} weighs more than its length. Only
 * when that is not enough are scripts themselves left out, see {@link #fewerScripts}.
 */
final class AskAiListingBounds {

    /** Well under the browser's 4 MiB, so that a serializer that escapes differently cannot close the gap. */
    static final int MAX_LISTING_BYTES = 3 * 1024 * 1024;

    private static final JsonMapper MAPPER = JsonMapper.shared();
    /** What an empty preview costs once serialized: its two quotes. */
    private static final int EMPTY_STRING_BYTES = 2;
    /** What one more item in a JSON array costs beyond itself: the comma. */
    private static final int LIST_SEPARATOR_BYTES = 1;

    private AskAiListingBounds() {
    }

    static AskAiQuestionsView withinBytes(final AskAiQuestionsView view) {
        return withinBytes(view, MAX_LISTING_BYTES);
    }

    static AskAiQuestionsView withinBytes(final AskAiQuestionsView view, final int maxBytes) {
        if (serializedBytes(view) <= maxBytes) {
            return view;
        }
        final List<AskAiQuestionsView.Target> bare = view.targets().stream().map(target -> withoutPreview(target))
            .toList();
        final int baseBytes = serializedBytes(withTargets(view, bare, true, view.truncated()));
        if (baseBytes > maxBytes) {
            return fewerScripts(withTargets(view, bare, true, true), maxBytes);
        }
        final List<AskAiQuestionsView.Target> kept = new ArrayList<>(view.targets().size());
        int spent = baseBytes;
        for (final AskAiQuestionsView.Target target : view.targets()) {
            final int cost = previewBytes(target);
            if (cost > 0 && spent + cost <= maxBytes) {
                spent += cost;
                kept.add(target);
            }
            else {
                kept.add(withoutPreview(target));
            }
        }
        return withTargets(view, kept, true, view.truncated());
    }

    /**
     * With every preview gone and the listing still too big, what is left to give up is scripts: those no question
     * names, in listing order from the end. The project, its sprites and every script a question points at stay, so
     * that nothing offered points at nothing; what goes is the chance to ask about the scripts dropped, which is why
     * the listing then says it is a selection. Past even that there is nothing left to cut, and the listing is sent as
     * it is.
     */
    private static AskAiQuestionsView fewerScripts(final AskAiQuestionsView bare, final int maxBytes) {
        final Set<String> asked = new HashSet<>();
        bare.inquiries().forEach(inquiry -> asked.add(inquiry.target()));
        bare.findings().forEach(finding -> asked.add(finding.target()));
        final List<AskAiQuestionsView.Target> essential = bare.targets().stream()
            .filter(target -> !isScript(target) || asked.contains(target.key())).toList();
        final List<AskAiQuestionsView.Target> kept = new ArrayList<>(bare.targets().size());
        int spent = serializedBytes(withTargets(bare, essential, true, true));
        for (final AskAiQuestionsView.Target target : bare.targets()) {
            if (!isScript(target) || asked.contains(target.key())) {
                kept.add(target);
                continue;
            }
            final int cost = serializedBytes(target) + LIST_SEPARATOR_BYTES;
            if (spent + cost <= maxBytes) {
                spent += cost;
                kept.add(target);
            }
        }
        return withTargets(bare, kept, true, true);
    }

    private static boolean isScript(final AskAiQuestionsView.Target target) {
        return "script".equals(target.kind()) || "procedure".equals(target.kind());
    }

    private static int serializedBytes(final AskAiQuestionsView.Target target) {
        return MAPPER.writeValueAsBytes(target).length;
    }

    private static int serializedBytes(final AskAiQuestionsView view) {
        return MAPPER.writeValueAsBytes(view).length;
    }

    /** What the preview adds to the listing beyond an empty one, in serialized bytes. */
    private static int previewBytes(final AskAiQuestionsView.Target target) {
        if (target.scratchblocks().isEmpty()) {
            return 0;
        }
        return MAPPER.writeValueAsString(target.scratchblocks()).getBytes(StandardCharsets.UTF_8).length
            - EMPTY_STRING_BYTES;
    }

    private static AskAiQuestionsView.Target withoutPreview(final AskAiQuestionsView.Target target) {
        if (target.scratchblocks().isEmpty()) {
            return target;
        }
        return new AskAiQuestionsView.Target(
            target.key(), target.kind(), target.label(), target.parent(), "", target.thumbnail(), target.intents()
        );
    }

    private static AskAiQuestionsView withTargets(
        final AskAiQuestionsView view, final List<AskAiQuestionsView.Target> targets,
        final boolean previewsTruncated, final boolean truncated
    ) {
        return new AskAiQuestionsView(
            view.schemaVersion(), view.inquiries(), view.findings(), targets, truncated, previewsTruncated
        );
    }
}
