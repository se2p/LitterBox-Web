/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.metrics;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import org.springframework.stereotype.Component;

import com.google.common.graph.EndpointPair;

import de.uni_passau.fim.se2.litterbox.analytics.GraphType;
import de.uni_passau.fim.se2.litterbox.ast.model.ASTNode;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.cfg.CFGNode;
import de.uni_passau.fim.se2.litterbox.cfg.ControlFlowGraph;
import de.uni_passau.fim.se2.litterbox.cfg.ControlFlowGraphVisitor;
import de.uni_passau.fim.se2.litterbox.dependency.AbstractDependencyGraph;
import de.uni_passau.fim.se2.litterbox.dependency.ControlDependenceGraph;
import de.uni_passau.fim.se2.litterbox.dependency.DataDependenceGraph;
import de.uni_passau.fim.se2.litterbox.dependency.DominatorTree;
import de.uni_passau.fim.se2.litterbox.dependency.PostDominatorTree;
import de.uni_passau.fim.se2.litterbox.dependency.ProgramDependenceGraph;
import de.uni_passau.fim.se2.litterbox.dependency.TimeDependenceGraph;
import de.uni_passau.fim.se2.litterbox.utils.ScratchBlocksLabeler;

/**
 * Renders one core graph with stable DOT identifiers of our own and the same node labels the core HTML report uses.
 *
 * <p>
 * Labels come from {@link ScratchBlocksLabeler}, because a graph of AST class names is unreadable to a learner and
 * Scratchblocks paints every one of them in the "obsolete" red.
 *
 * <h2>Why this does not call LitterBox's own DOT emitters</h2>
 *
 * <p>
 * LitterBox has two, and neither can serve this endpoint:
 *
 * <ul>
 * <li>{@code AbstractDependencyGraph.toDotString(Function)} takes a labeller and escapes what the labeller returns, but
 * writes the node itself into the identifier position as {@code node.toString()} without escaping it. A node whose text
 * contains a quote or a backslash then produces DOT that will not parse. It also emits no styling, fixes every edge at
 * {@code penwidth=2}, iterates the graph's node and edge sets in whatever order they come in, and does not exist for a
 * plain control-flow graph, which is not an {@code AbstractDependencyGraph}.
 * <li>{@code DotVisitor.buildDotGraph(ASTNode)} numbers its identifiers safely, but likewise applies no styling and
 * returns only a string, with no node or edge counts.
 * </ul>
 *
 * <p>
 * This endpoint needs all three: identifiers that cannot be broken by program text, the presentation the core HTML
 * report uses, and the same bytes for the same program every time. Sorting nodes and edges by id is what gives the last
 * of those, which {@code MetricsGraphCapabilityTest} asserts by rendering one project twice.
 */
@Component
final class CoreGraphRenderer implements GraphRenderer {

    private static final Comparator<CFGNode> NODE_ORDER = Comparator.comparingInt(CFGNode::getId);

    private static final Set<String> STRUCTURAL_LABELS = Set.of("Entry", "Exit");

    /** The presentation the core HTML report applies to every graph, so both renderings look alike. */
    private static final String GRAPH_STYLE = """
          graph [rankdir=TB, fontname="sans-serif", bgcolor="transparent", ranksep="0.5", nodesep="0.2"];
          node [fontname="sans-serif", shape="box", style="filled,rounded", fillcolor="#ffffff", \
        color="#007bff", penwidth="0", margin="0.1,0.1"];
          edge [fontname="sans-serif", color="#6c757d", penwidth="0.8", arrowsize="0.8"];""";

    @Override
    public RenderedGraph render(final Program program, final GraphType graphType) {
        if (graphType == GraphType.AST) {
            return renderAst(program);
        }
        final ControlFlowGraphVisitor visitor = new ControlFlowGraphVisitor(program, null);
        visitor.visit(program);
        final ControlFlowGraph controlFlowGraph = visitor.getControlFlowGraph();
        return renderDependencyGraph(program, controlFlowGraph, graphType);
    }

    private RenderedGraph renderAst(final Program program) {
        final List<ASTNode> nodes = new ArrayList<>();
        final Map<ASTNode, Integer> indexes = new IdentityHashMap<>();
        final ArrayDeque<ASTNode> pending = new ArrayDeque<>();
        pending.push(program);
        while (!pending.isEmpty()) {
            final ASTNode node = pending.pop();
            if (indexes.containsKey(node)) {
                continue;
            }
            indexes.put(node, nodes.size());
            nodes.add(node);
            final List<? extends ASTNode> children = node.getChildren();
            for (int index = children.size() - 1; index >= 0; index--) {
                pending.push(children.get(index));
            }
        }

        final DotBuilder dot = new DotBuilder();
        dot.line("digraph {");
        dot.line(GRAPH_STYLE);
        for (int index = 0; index < nodes.size(); index++) {
            dot.line("  n" + index + " [label=\"" + escapeLabel(nodes.get(index).getClass().getSimpleName()) + "\"];");
        }
        for (int index = 0; index < nodes.size(); index++) {
            for (ASTNode child : nodes.get(index).getChildren()) {
                final Integer childIndex = indexes.get(child);
                if (childIndex != null) {
                    dot.line("  n" + index + " -> n" + childIndex + ";");
                }
            }
        }
        dot.line("}");
        return new RenderedGraph(dot.toString(), nodes.size(), countAstEdges(nodes));
    }

    private int countAstEdges(final List<ASTNode> nodes) {
        long count = 0;
        for (ASTNode node : nodes) {
            count += node.getChildren().size();
            if (count > Integer.MAX_VALUE) {
                return Integer.MAX_VALUE;
            }
        }
        return (int) count;
    }

    private RenderedGraph renderDependencyGraph(
        final Program program, final ControlFlowGraph controlFlowGraph, final GraphType graphType
    ) {
        final AbstractDependencyGraph graph = switch (graphType) {
            case CDG -> new ControlDependenceGraph(controlFlowGraph);
            case DDG -> new DataDependenceGraph(controlFlowGraph);
            case DT -> new DominatorTree(controlFlowGraph);
            case PDT -> new PostDominatorTree(controlFlowGraph);
            case TDG -> new TimeDependenceGraph(controlFlowGraph);
            case PDG -> new ProgramDependenceGraph(controlFlowGraph);
            case AST, CFG -> null;
        };
        final Function<CFGNode, String> labeler = new ScratchBlocksLabeler(program);
        if (graph != null) {
            return renderEdges(labeler, graph.getNodes(), graph.getEdges());
        }
        return renderEdges(labeler, controlFlowGraph.getNodes(), controlFlowGraph.getEdges());
    }

    private RenderedGraph renderEdges(
        final Function<CFGNode, String> labeler,
        final Set<CFGNode> graphNodes,
        final Set<EndpointPair<CFGNode>> graphEdges
    ) {
        final List<CFGNode> nodes = graphNodes.stream().sorted(NODE_ORDER).toList();
        final Map<CFGNode, Integer> indexes = new java.util.HashMap<>();
        for (int index = 0; index < nodes.size(); index++) {
            indexes.put(nodes.get(index), index);
        }
        final List<EndpointPair<CFGNode>> edges = graphEdges.stream()
            .sorted(
                Comparator.comparingInt((EndpointPair<CFGNode> edge) -> edge.nodeU().getId())
                    .thenComparingInt(edge -> edge.nodeV().getId())
            )
            .toList();

        final DotBuilder dot = new DotBuilder();
        dot.line("digraph {");
        dot.line(GRAPH_STYLE);
        for (int index = 0; index < nodes.size(); index++) {
            final String label = nodeLabel(labeler, nodes.get(index));
            // Entry and exit are the only nodes that are not program text, so the report outlines them.
            final String outline = STRUCTURAL_LABELS.contains(label) ? ", penwidth=\"1.5\"" : "";
            dot.line("  n" + index + " [label=\"" + escapeLabel(label) + "\"" + outline + "];");
        }
        for (EndpointPair<CFGNode> edge : edges) {
            final Integer source = indexes.get(edge.nodeU());
            final Integer target = indexes.get(edge.nodeV());
            if (source != null && target != null) {
                dot.line("  n" + source + " -> n" + target + ";");
            }
        }
        dot.line("}");
        return new RenderedGraph(dot.toString(), nodes.size(), edges.size());
    }

    /**
     * The labeler already answers with the node's own name for entry, exit and anything it cannot express as blocks;
     * this only guards against a labeler that hands back nothing at all.
     */
    private String nodeLabel(final Function<CFGNode, String> labeler, final CFGNode node) {
        final String label = labeler.apply(node);
        if (label != null && !label.isBlank()) {
            return label;
        }
        final ASTNode astNode = node.getASTNode();
        return astNode == null ? node.getClass().getSimpleName() : astNode.getClass().getSimpleName();
    }

    private static String escapeLabel(final String value) {
        final StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            final char character = value.charAt(index);
            switch (character) {
                case '\\' -> escaped.append("\\\\");
                case '"' -> escaped.append("\\\"");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                default -> {
                    if (Character.isISOControl(character)) {
                        escaped.append('?');
                    }
                    else {
                        escaped.append(character);
                    }
                }
            }
        }
        return escaped.toString();
    }

    private static final class DotBuilder {

        private final StringBuilder value = new StringBuilder();

        private void line(final String line) {
            value.append(line).append('\n');
        }

        @Override
        public String toString() {
            return value.toString();
        }
    }
}
