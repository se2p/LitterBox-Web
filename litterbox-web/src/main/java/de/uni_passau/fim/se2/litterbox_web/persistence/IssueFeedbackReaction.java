/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence;

/**
 * What a reader can say about an issue they were shown.
 *
 * <p>
 * The API spells a reaction one way and the column another. Naming the wire spelling here is what keeps a request from
 * reaching the column in the wrong one, and what makes an unsupported reaction a refusal rather than a row.
 */
public enum IssueFeedbackReaction {

    HELPFUL("helpful"),
    NOT_HELPFUL("not-helpful");

    private final String wireValue;

    IssueFeedbackReaction(final String wireValue) {
        this.wireValue = wireValue;
    }

    public static IssueFeedbackReaction fromWireValue(final String value) {
        for (IssueFeedbackReaction reaction : values()) {
            if (reaction.wireValue.equals(value)) {
                return reaction;
            }
        }
        throw new IllegalArgumentException("Unsupported feedback reaction");
    }

    public String storageValue() {
        return name();
    }
}
