/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;

/**
 * Walk over a parsed program that every capability performs before committing to any work.
 *
 * <p>
 * The walk is iterative and identity-based: a node reached twice is counted once, and a program deep enough to exhaust
 * a recursive walk is measured rather than refused. It is public only because the capability implementations live in
 * sibling packages.
 */
public final class AstNodes {

    private AstNodes() {
    }

    /**
     * Counts the distinct nodes of a program, abandoning the walk as soon as the count passes the limit.
     *
     * @param program parsed program
     * @param limit   node count limit
     * @return the node count if below the limit; some number >limit otherwise
     */
    public static int count(final Program program, final int limit) {
        if (program == null || limit < 1) {
            return limit + 1;
        }
        final Set<ASTNode> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        final ArrayDeque<ASTNode> pending = new ArrayDeque<>();
        pending.push(program);
        int count = 0;
        while (!pending.isEmpty()) {
            final ASTNode node = pending.pop();
            if (!visited.add(node)) {
                continue;
            }
            count++;
            if (count > limit) {
                return count;
            }
            final List<? extends ASTNode> children = node.getChildren();
            for (int index = children.size() - 1; index >= 0; index--) {
                pending.push(children.get(index));
            }
        }
        return count;
    }
}
