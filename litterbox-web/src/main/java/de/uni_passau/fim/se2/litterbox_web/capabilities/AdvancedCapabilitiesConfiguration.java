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

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/** Configuration and bounded resource ceilings for source-derived capabilities. */
@Component
@ConfigurationProperties(prefix = "litterbox.capabilities")
public final class AdvancedCapabilitiesConfiguration {

    public static final String METRICS_GRAPHS = "metrics-graphs";
    public static final String SEMANTIC_DIFF = "semantic-diff";
    public static final String PROGRAM_EXPORT = "program-export";
    public static final String FAULT_INJECTION = "fault-injection";

    private final GraphLimits metricsGraphs = new GraphLimits();
    private final DiffLimits semanticDiff = new DiffLimits();
    private final ExportLimits programExport = new ExportLimits();
    private final InjectionLimits faultInjection = new InjectionLimits();

    public GraphLimits getMetricsGraphs() {
        return metricsGraphs;
    }

    public DiffLimits getSemanticDiff() {
        return semanticDiff;
    }

    public ExportLimits getProgramExport() {
        return programExport;
    }

    public InjectionLimits getFaultInjection() {
        return faultInjection;
    }

    public Set<String> enabledFeatures() {
        final Set<String> enabled = new LinkedHashSet<>();
        addIfEnabled(enabled, METRICS_GRAPHS, metricsGraphs.isEnabled());
        addIfEnabled(enabled, SEMANTIC_DIFF, semanticDiff.isEnabled());
        addIfEnabled(enabled, PROGRAM_EXPORT, programExport.isEnabled());
        addIfEnabled(enabled, FAULT_INJECTION, faultInjection.isEnabled());
        return Collections.unmodifiableSet(enabled);
    }

    @PostConstruct
    void validate() {
        requirePositive(metricsGraphs.maxInputBytes, "graph input bytes");
        requirePositive(metricsGraphs.maxAstNodes, "graph AST nodes");
        requirePositive(metricsGraphs.maxGraphNodes, "graph nodes");
        requirePositive(metricsGraphs.maxGraphEdges, "graph edges");
        requirePositive(metricsGraphs.maxDotBytes, "graph DOT bytes");
        requirePositive(metricsGraphs.timeout, "graph timeout");
        requirePositive(semanticDiff.maxInputBytes, "diff input bytes");
        requirePositive(semanticDiff.maxAstNodesPerInput, "diff AST nodes");
        requirePositive(semanticDiff.maxResponseBytes, "diff response bytes");
        requirePositive(semanticDiff.timeout, "diff timeout");
        requirePositive(programExport.maxInputBytes, "export input bytes");
        requirePositive(programExport.maxAstNodes, "export AST nodes");
        requirePositive(programExport.maxOutputBytes, "export output bytes");
        requirePositive(programExport.timeout, "export timeout");
        requirePositive(faultInjection.maxInputBytes, "injection input bytes");
        requirePositive(faultInjection.maxAstNodes, "injection AST nodes");
        requirePositive(faultInjection.maxSelectedInjectors, "selected injectors");
        requirePositive(faultInjection.maxMutationResults, "mutation results");
        requirePositive(faultInjection.maxArchiveEntries, "derived archive entries");
        requirePositive(faultInjection.maxArchiveBytes, "derived archive bytes");
        requirePositive(faultInjection.maxUncompressedBytes, "derived uncompressed bytes");
        requirePositive(faultInjection.maxArchiveEntryBytes, "derived archive entry bytes");
        requirePositive(faultInjection.timeout, "injection timeout");
    }

    private void addIfEnabled(final Set<String> enabled, final String name, final boolean condition) {
        if (condition) {
            enabled.add(name);
        }
    }

    private void requirePositive(final long value, final String name) {
        if (value < 1) {
            throw new IllegalStateException("Capability limit must be positive: " + name);
        }
    }

    private void requirePositive(final Duration value, final String name) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalStateException("Capability limit must be positive: " + name);
        }
    }

    public static final class GraphLimits {

        private boolean enabled;
        private long maxInputBytes = 50L * 1024 * 1024;
        private int maxAstNodes = 200_000;
        private int maxGraphNodes = 100_000;
        private int maxGraphEdges = 250_000;
        // Node labels carry block source rather than AST class names, so the same graph spells out several times
        // longer than it used to. The node and edge caps above remain the limit that actually bites.
        private int maxDotBytes = 16 * 1024 * 1024;
        private Duration timeout = Duration.ofSeconds(20);

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(final boolean enabled) {
            this.enabled = enabled;
        }

        public long getMaxInputBytes() {
            return maxInputBytes;
        }

        public void setMaxInputBytes(final long maxInputBytes) {
            this.maxInputBytes = maxInputBytes;
        }

        public int getMaxAstNodes() {
            return maxAstNodes;
        }

        public void setMaxAstNodes(final int maxAstNodes) {
            this.maxAstNodes = maxAstNodes;
        }

        public int getMaxGraphNodes() {
            return maxGraphNodes;
        }

        public void setMaxGraphNodes(final int maxGraphNodes) {
            this.maxGraphNodes = maxGraphNodes;
        }

        public int getMaxGraphEdges() {
            return maxGraphEdges;
        }

        public void setMaxGraphEdges(final int maxGraphEdges) {
            this.maxGraphEdges = maxGraphEdges;
        }

        public int getMaxDotBytes() {
            return maxDotBytes;
        }

        public void setMaxDotBytes(final int maxDotBytes) {
            this.maxDotBytes = maxDotBytes;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(final Duration timeout) {
            this.timeout = timeout;
        }
    }

    public static final class DiffLimits {

        private boolean enabled;
        private long maxInputBytes = 50L * 1024 * 1024;
        private int maxAstNodesPerInput = 200_000;
        private int maxResponseBytes = 5 * 1024 * 1024;
        private Duration timeout = Duration.ofSeconds(30);

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(final boolean enabled) {
            this.enabled = enabled;
        }

        public long getMaxInputBytes() {
            return maxInputBytes;
        }

        public void setMaxInputBytes(final long maxInputBytes) {
            this.maxInputBytes = maxInputBytes;
        }

        public int getMaxAstNodesPerInput() {
            return maxAstNodesPerInput;
        }

        public void setMaxAstNodesPerInput(final int maxAstNodesPerInput) {
            this.maxAstNodesPerInput = maxAstNodesPerInput;
        }

        public int getMaxResponseBytes() {
            return maxResponseBytes;
        }

        public void setMaxResponseBytes(final int maxResponseBytes) {
            this.maxResponseBytes = maxResponseBytes;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(final Duration timeout) {
            this.timeout = timeout;
        }
    }

    public static final class ExportLimits {

        private boolean enabled;
        private long maxInputBytes = 50L * 1024 * 1024;
        private int maxAstNodes = 200_000;
        private int maxOutputBytes = 10 * 1024 * 1024;
        private Duration timeout = Duration.ofSeconds(20);

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(final boolean enabled) {
            this.enabled = enabled;
        }

        public long getMaxInputBytes() {
            return maxInputBytes;
        }

        public void setMaxInputBytes(final long maxInputBytes) {
            this.maxInputBytes = maxInputBytes;
        }

        public int getMaxAstNodes() {
            return maxAstNodes;
        }

        public void setMaxAstNodes(final int maxAstNodes) {
            this.maxAstNodes = maxAstNodes;
        }

        public int getMaxOutputBytes() {
            return maxOutputBytes;
        }

        public void setMaxOutputBytes(final int maxOutputBytes) {
            this.maxOutputBytes = maxOutputBytes;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(final Duration timeout) {
            this.timeout = timeout;
        }
    }

    public static final class InjectionLimits {

        private boolean enabled;
        private long maxInputBytes = 50L * 1024 * 1024;
        private int maxAstNodes = 200_000;
        private int maxSelectedInjectors = 8;
        private int maxMutationResults = 200;
        private int maxArchiveEntries = 2_000;
        private long maxArchiveBytes = 100L * 1024 * 1024;
        private long maxUncompressedBytes = 100L * 1024 * 1024;
        private long maxArchiveEntryBytes = 25L * 1024 * 1024;
        private Duration timeout = Duration.ofSeconds(30);

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(final boolean enabled) {
            this.enabled = enabled;
        }

        public long getMaxInputBytes() {
            return maxInputBytes;
        }

        public void setMaxInputBytes(final long maxInputBytes) {
            this.maxInputBytes = maxInputBytes;
        }

        public int getMaxAstNodes() {
            return maxAstNodes;
        }

        public void setMaxAstNodes(final int maxAstNodes) {
            this.maxAstNodes = maxAstNodes;
        }

        public int getMaxSelectedInjectors() {
            return maxSelectedInjectors;
        }

        public void setMaxSelectedInjectors(final int maxSelectedInjectors) {
            this.maxSelectedInjectors = maxSelectedInjectors;
        }

        public int getMaxMutationResults() {
            return maxMutationResults;
        }

        public void setMaxMutationResults(final int maxMutationResults) {
            this.maxMutationResults = maxMutationResults;
        }

        public int getMaxArchiveEntries() {
            return maxArchiveEntries;
        }

        public void setMaxArchiveEntries(final int maxArchiveEntries) {
            this.maxArchiveEntries = maxArchiveEntries;
        }

        public long getMaxArchiveBytes() {
            return maxArchiveBytes;
        }

        public void setMaxArchiveBytes(final long maxArchiveBytes) {
            this.maxArchiveBytes = maxArchiveBytes;
        }

        public long getMaxUncompressedBytes() {
            return maxUncompressedBytes;
        }

        public void setMaxUncompressedBytes(final long maxUncompressedBytes) {
            this.maxUncompressedBytes = maxUncompressedBytes;
        }

        public long getMaxArchiveEntryBytes() {
            return maxArchiveEntryBytes;
        }

        public void setMaxArchiveEntryBytes(final long maxArchiveEntryBytes) {
            this.maxArchiveEntryBytes = maxArchiveEntryBytes;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(final Duration timeout) {
            this.timeout = timeout;
        }
    }
}
