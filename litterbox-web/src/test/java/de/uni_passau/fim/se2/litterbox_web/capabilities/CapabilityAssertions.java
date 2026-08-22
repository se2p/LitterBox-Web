/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.capabilities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;

/**
 * The assertion every capability test makes about a refusal: it fails as a capability failure carrying exactly the
 * stable code the API promises, and never as some other exception that happens to be thrown along the way.
 */
public final class CapabilityAssertions {

    private CapabilityAssertions() {
    }

    /**
     * Asserts that the action fails with a {@link CapabilityException} carrying the given code.
     *
     * @param code   expected stable capability error code
     * @param action call expected to fail
     */
    public static void assertCode(final String code, final ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(
            CapabilityException.class, exception -> assertThat(exception.code()).isEqualTo(code)
        );
    }
}
