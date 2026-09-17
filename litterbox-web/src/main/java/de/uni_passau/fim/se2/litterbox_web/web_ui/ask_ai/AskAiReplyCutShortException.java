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

/**
 * The provider stopped writing at the output token cap before the reply was finished.
 *
 * <p>
 * What arrived is the front of a JSON object with no end, which no parser can use, and asking again for the same answer
 * under the same cap would cut it off at the same place. It is raised instead of returning the fragment so that the
 * caller can ask for a shorter answer rather than a fresh one. The fragment itself is not carried: it is unbounded
 * provider output about a learner's project, and nothing reads it.
 */
public final class AskAiReplyCutShortException extends RuntimeException {

    public AskAiReplyCutShortException() {
        super("Provider reply was cut short at the output token cap");
    }
}
