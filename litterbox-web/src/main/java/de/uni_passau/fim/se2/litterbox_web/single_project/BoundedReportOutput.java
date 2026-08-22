/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;

/**
 * A sink that stops at a ceiling instead of growing to whatever a report generator produces, and remembers that it did.
 * Writing goes on returning normally past the limit, so the generator finishes cleanly and the caller decides what an
 * over-long report means.
 */
final class BoundedReportOutput extends OutputStream {

    private final int limit;
    private final ByteArrayOutputStream delegate = new ByteArrayOutputStream();
    private boolean exceeded;

    BoundedReportOutput(final int limit) {
        if (limit < 1) {
            throw new IllegalArgumentException("Report limit must be positive");
        }
        this.limit = limit;
    }

    @Override
    public void write(final int value) {
        if (delegate.size() >= limit) {
            exceeded = true;
            return;
        }
        delegate.write(value);
    }

    @Override
    public void write(final byte[] bytes, final int offset, final int length) {
        if (length < 0 || offset < 0 || offset > bytes.length - length) {
            throw new IndexOutOfBoundsException();
        }
        final int remaining = limit - delegate.size();
        if (length > remaining) {
            if (remaining > 0) {
                delegate.write(bytes, offset, remaining);
            }
            exceeded = true;
            return;
        }
        delegate.write(bytes, offset, length);
    }

    boolean exceeded() {
        return exceeded;
    }

    byte[] toByteArray() {
        return delegate.toByteArray();
    }
}
