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

import java.util.List;

import org.jspecify.annotations.Nullable;

/** Records for source-derived analysis and download workflows. */
public final class AdvancedCapabilityDtos {

    public static final int SCHEMA_VERSION = 1;

    private AdvancedCapabilityDtos() {
    }

    public record AnalysisReference(String submissionToken, long analysisId) {
    }

    public record SourceView(long analysisId, String name) {
    }

    public record DiffRequest(AnalysisReference before, AnalysisReference after) {
    }

    public record DiffCounts(
        int beforeTotal,
        int afterTotal,
        int fixed,
        int newIssues,
        int persisting,
        int removed
    ) {
    }

    public record DiffIssueView(
        String finderId,
        String finderName,
        String issueType,
        int severity,
        String sprite,
        @Nullable String blockId,
        String scratchblocks
    ) {
    }

    public record ScriptDiffView(
        String changeType,
        @Nullable String beforeScratchblocks,
        @Nullable String afterScratchblocks,
        @Nullable String annotatedBeforeScratchblocks,
        @Nullable String annotatedAfterScratchblocks
    ) {
    }

    public record ActorDiffView(String actorName, boolean stage, List<ScriptDiffView> scripts) {

        public ActorDiffView {
            scripts = List.copyOf(scripts);
        }
    }

    public record DiffView(
        int schemaVersion,
        SourceView before,
        SourceView after,
        DiffCounts counts,
        List<DiffIssueView> fixed,
        List<DiffIssueView> newIssues,
        List<DiffIssueView> persisting,
        List<DiffIssueView> removed,
        List<ActorDiffView> actors
    ) {

        public DiffView {
            fixed = List.copyOf(fixed);
            newIssues = List.copyOf(newIssues);
            persisting = List.copyOf(persisting);
            removed = List.copyOf(removed);
            actors = List.copyOf(actors);
        }
    }

    public record ExportRequest(String format, ExportTarget target) {
    }

    public record ExportTarget(
        String kind,
        @Nullable String spriteName,
        @Nullable String scriptId
    ) {
    }

    public record ExportSpriteTargetView(String name, boolean stage) {
    }

    public record ExportScriptTargetView(
        String scriptId,
        String spriteName,
        int ordinal,
        String scratchblocks
    ) {
    }

    public record ExportTargetsView(
        List<ExportSpriteTargetView> sprites,
        List<ExportScriptTargetView> scripts
    ) {

        public ExportTargetsView {
            sprites = List.copyOf(sprites);
            scripts = List.copyOf(scripts);
        }
    }

    public record InjectorView(
        String injectorId,
        String finderId,
        String name,
        String description
    ) {
    }

    public record InjectorCatalogueView(
        List<InjectorView> injectors,
        int maxSelectedInjectors,
        boolean allSelectionSupported
    ) {

        public InjectorCatalogueView {
            injectors = List.copyOf(injectors);
        }
    }

    public record InjectionRequest(List<String> injectorIds, Boolean all) {

        public InjectionRequest(final List<String> injectorIds) {
            this(injectorIds, false);
        }

        public InjectionRequest {
            injectorIds = List.copyOf(injectorIds);
        }

        public boolean selectsAll() {
            return Boolean.TRUE.equals(all);
        }
    }

    public record InjectionResultView(
        String injectorId,
        String finderId,
        int resultIndex,
        String spriteName,
        String originalScriptId,
        String mutatedScriptId,
        String originalScratchblocks,
        String mutatedScratchblocks
    ) {
    }

    public record InjectionFailureView(String injectorId, String finderId, String code) {
    }

    public record InjectionPreview(
        int schemaVersion,
        SourceView source,
        List<InjectionResultView> results,
        List<InjectionFailureView> failures
    ) {

        public InjectionPreview {
            results = List.copyOf(results);
            failures = List.copyOf(failures);
        }
    }

    public record InjectionDownloadRequest(String injectorId, int resultIndex) {
    }
}
