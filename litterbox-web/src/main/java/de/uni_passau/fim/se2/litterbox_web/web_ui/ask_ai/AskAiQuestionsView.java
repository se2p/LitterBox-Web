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

import java.util.List;

import jakarta.annotation.Nullable;

/**
 * Question and navigation data for one analyzed project.
 *
 * @param truncated         Whether some questions were left out, the project being too big to list them all.
 * @param previewsTruncated Whether some scripts are listed without their code, the listing being too big to carry it
 *                          all; every script is still there to be asked about.
 */
public record AskAiQuestionsView(
    int schemaVersion,
    List<Inquiry> inquiries,
    List<Finding> findings,
    List<Target> targets,
    boolean truncated,
    boolean previewsTruncated
) {

    public AskAiQuestionsView {
        inquiries = List.copyOf(inquiries);
        findings = List.copyOf(findings);
        targets = List.copyOf(targets);
    }

    public record Inquiry(String selector, String kind, String label, String target) {
    }

    /** Finding data includes its finder id and marked source snippet for analysis-page navigation. */
    public record Finding(
        String selector, String label, String family, String target, String finder, String scratchblocks
    ) {

        public Finding {
            if (scratchblocks == null) {
                scratchblocks = "";
            }
        }
    }

    /** Project, actor, or script target; thumbnails are submission-scoped and intents are target-specific. */
    public record Target(
        String key,
        String kind,
        String label,
        String parent,
        String scratchblocks,
        @Nullable String thumbnail,
        List<String> intents
    ) {

        public Target {
            intents = List.copyOf(intents);
        }
    }
}
