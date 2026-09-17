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

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class AskAiListingBoundsTest {

    private static final int PREVIEW_LENGTH = 4096;

    /** The browser counts bytes, and a preview full of é weighs twice its length. */
    @Test
    void aListingOfManyMultibytePreviewsIsCutToWhatTheBrowserWillRead() {
        final AskAiQuestionsView listing = listing(512, "é".repeat(PREVIEW_LENGTH));
        assertThat(bytes(listing)).as("the case under test really is over the limit")
            .isGreaterThan(AskAiListingBounds.MAX_LISTING_BYTES);

        final AskAiQuestionsView bounded = AskAiListingBounds.withinBytes(listing);

        assertThat(bytes(bounded)).isLessThanOrEqualTo(AskAiListingBounds.MAX_LISTING_BYTES);
        assertThat(bounded.targets()).as("every script stays a target to ask about").hasSize(listing.targets().size());
        assertThat(bounded.targets().stream().map(AskAiQuestionsView.Target::key))
            .containsExactlyElementsOf(listing.targets().stream().map(AskAiQuestionsView.Target::key).toList());
        assertThat(bounded.targets().get(1).scratchblocks()).as("the first scripts keep their code")
            .hasSize(PREVIEW_LENGTH);
        assertThat(bounded.targets().getLast().scratchblocks()).as("the last ones go without").isEmpty();
        assertThat(bounded.previewsTruncated()).isTrue();
        assertThat(bounded.truncated()).as("no question was left out, and the listing must not say one was")
            .isFalse();
    }

    @Test
    void aListingOfVeryManyShortPreviewsIsCutTheSameWay() {
        final AskAiQuestionsView listing = listing(
            20_000, "when green flag clicked\nsay [Hello!] for (2) seconds\n"
                .repeat(4)
        );
        assertThat(bytes(listing)).isGreaterThan(AskAiListingBounds.MAX_LISTING_BYTES);

        final AskAiQuestionsView bounded = AskAiListingBounds.withinBytes(listing);

        assertThat(bytes(bounded)).isLessThanOrEqualTo(AskAiListingBounds.MAX_LISTING_BYTES);
        assertThat(bounded.targets()).hasSize(listing.targets().size());
        assertThat(bounded.previewsTruncated()).isTrue();
    }

    /**
     * With no preview left to give, a listing of ten thousand long-named scripts gives up scripts nobody asked about.
     */
    @Test
    void aListingTooBigEvenWithoutPreviewsKeepsWhatQuestionsPointAtAndSaysItIsASelection() {
        final int scripts = 10_000;
        final String longTrigger = "when I receive [" + "a very long message name ".repeat(16) + "v]";
        final List<AskAiQuestionsView.Target> targets = new ArrayList<>(listing(0, "").targets());
        for (int index = 0; index < scripts; index++) {
            targets.add(
                new AskAiQuestionsView.Target(
                    "script-" + index, "script", longTrigger, "sprite", "", null, List.of("EXPLAIN")
                )
            );
        }
        final String lastScript = "script-" + (scripts - 1);
        final AskAiQuestionsView listing = new AskAiQuestionsView(
            1,
            List.of(new AskAiQuestionsView.Inquiry("inquiry:v1-a", "event", "What starts it?", lastScript)),
            List.of(new AskAiQuestionsView.Finding("finding:v1-b", "Says nothing", "bug", "script-5000", "F", "")),
            targets, false, false
        );
        assertThat(bytes(listing)).as("the case under test really is over the limit with no preview to give")
            .isGreaterThan(AskAiListingBounds.MAX_LISTING_BYTES);

        final AskAiQuestionsView bounded = AskAiListingBounds.withinBytes(listing);

        assertThat(bytes(bounded)).isLessThanOrEqualTo(AskAiListingBounds.MAX_LISTING_BYTES);
        assertThat(bounded.targets().size()).isLessThan(listing.targets().size());
        final List<String> keys = bounded.targets().stream().map(AskAiQuestionsView.Target::key).toList();
        assertThat(keys).as("what a question points at stays, whatever its place in the list")
            .contains("program", "script-5000", lastScript);
        assertThat(keys.indexOf("script-5000")).as("and the rest keep their order")
            .isLessThan(keys.indexOf(lastScript));
        assertThat(keys.subList(1, keys.size())).isSortedAccordingTo(
            (left, right) -> Integer.compare(scriptNumber(left), scriptNumber(right))
        );
        assertThat(bounded.truncated()).as("the scripts left out could have been asked about").isTrue();
        assertThat(bounded.previewsTruncated()).isTrue();
        assertThat(bounded.inquiries()).isEqualTo(listing.inquiries());
        assertThat(bounded.findings()).isEqualTo(listing.findings());
    }

    private static int scriptNumber(final String key) {
        return Integer.parseInt(key.substring("script-".length()));
    }

    @Test
    void aListingThatFitsIsHandedBackAsItIs() {
        final AskAiQuestionsView listing = listing(3, "when green flag clicked\nmove (10) steps\n");

        assertThat(AskAiListingBounds.withinBytes(listing)).isSameAs(listing);
        assertThat(listing.previewsTruncated()).isFalse();
    }

    private static int bytes(final AskAiQuestionsView view) {
        return JsonMapper.shared().writeValueAsBytes(view).length;
    }

    private static AskAiQuestionsView listing(final int scripts, final String preview) {
        final List<AskAiQuestionsView.Target> targets = new ArrayList<>();
        targets.add(new AskAiQuestionsView.Target("program", "program", "", "", "", null, List.of("SUMMARISE")));
        for (int index = 0; index < scripts; index++) {
            targets.add(
                new AskAiQuestionsView.Target(
                    "script-" + index, "script", "when the green flag is clicked", "sprite", preview, null,
                    List.of("EXPLAIN")
                )
            );
        }
        return new AskAiQuestionsView(1, List.of(), List.of(), targets, false, false);
    }
}
