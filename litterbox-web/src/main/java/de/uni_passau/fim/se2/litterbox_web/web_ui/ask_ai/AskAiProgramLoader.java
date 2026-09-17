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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.RejectedExecutionException;

import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.execution.AnalysisWork;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Analysis;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.AnalysisRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.DatabaseCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Digests;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifact;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactAccess;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SourceArtifactMetadata;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.StorageCapacityExceededException;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.Submission;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.SubmissionRepository;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.ProjectArchiveInspector;
import de.uni_passau.fim.se2.litterbox_web.web_ui.single_project.SingleProjectSupport;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

@Service
public final class AskAiProgramLoader {

    private static final long MAX_INPUT_BYTES = SingleProjectSupport.MAX_PROJECT_BYTES;
    private static final int SHA256_BYTES = 32;
    private static final int MAX_METADATA_BYTES = 1024 * 1024;
    private static final String RETAINED_PROGRAM_NAME = "retained-project";

    private final SubmissionRepository submissions;
    private final AnalysisRepository analyses;
    private final SourceArtifactAccess sourceArtifacts;
    private final AnalysisWork analysisWork;
    private final Scratch3ParserService parser;
    private final ProjectArchiveInspector archiveInspector;

    public AskAiProgramLoader(
        final SubmissionRepository submissions,
        final AnalysisRepository analyses,
        final SourceArtifactAccess sourceArtifacts,
        final AnalysisWork analysisWork,
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector
    ) {
        this.submissions = Objects.requireNonNull(submissions, "submissions");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.sourceArtifacts = Objects.requireNonNull(sourceArtifacts, "sourceArtifacts");
        this.analysisWork = Objects.requireNonNull(analysisWork, "analysisWork");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.archiveInspector = Objects.requireNonNull(archiveInspector, "archiveInspector");
    }

    /**
     * Validates submission retention and analysis ownership/status before source access.
     *
     * @param submissionToken token proving access to the submission
     * @param analysisId      analysis whose source is requested
     * @return the authorized submission and analysis
     */
    public Mono<Authorized> authorize(final String submissionToken, final long analysisId) {
        if (submissionToken == null || submissionToken.isBlank() || submissionToken.length() > 128 || analysisId < 1) {
            return Mono.error(AskAiProblemException.contextNotFound());
        }
        return submissions.findByToken(submissionToken)
            .filter(this::isRetainedSubmission)
            .flatMap(
                owner -> analyses.findById(analysisId).flatMap(analysis -> authorizedAnalysis(owner, analysis))
            )
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()));
    }

    public Mono<Program> loadProgram(final Authorized authorized) {
        return loadProject(authorized).map(LoadedProject::program);
    }

    /**
     * Loads and parses the retained source artifact for an authorized analysis.
     *
     * @param authorized previously authorized submission and analysis
     * @return the parsed project and costume hashes
     */
    public Mono<LoadedProject> loadProject(final Authorized authorized) {
        final Analysis analysis = authorized.analysis();
        if (analysis.sourceArtifactId() < 1) {
            return Mono.error(AskAiProblemException.contextNotFound());
        }
        return sourceArtifacts.findById(analysis.sourceArtifactId())
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()))
            .flatMap(artifact -> loadProgram(analysis, artifact));
    }

    /**
     * Preserves request/capacity errors and hides other context failures.
     *
     * @param error failure raised while authorizing or loading context
     * @return the original public failure or a generic context failure
     */
    public static Throwable mapContextFailure(final Throwable error) {
        final Throwable cause = Exceptions.unwrap(error);
        if (cause instanceof IllegalArgumentException || isCapacityIssue(cause) || isContextNotFound(cause)) {
            return cause;
        }
        return AskAiProblemException.contextNotFound();
    }

    private static boolean isContextNotFound(final Throwable cause) {
        return cause instanceof AskAiProblemException problem
            && problem.reason() == AskAiProblemException.Reason.CONTEXT_NOT_FOUND;
    }

    private Mono<Authorized> authorizedAnalysis(final Submission owner, final Analysis analysis) {
        if (analysis.submissionId() == owner.id() && isCompleted(analysis.status())) {
            return Mono.just(new Authorized(owner, analysis));
        }
        return Mono.error(AskAiProblemException.contextNotFound());
    }

    private Mono<LoadedProject> loadProgram(final Analysis analysis, final SourceArtifact artifact) {
        if (artifact.byteSize() < 0 || artifact.byteSize() > MAX_INPUT_BYTES) {
            return Mono.error(AskAiProblemException.contextNotFound());
        }
        final byte[] expectedDigest = analysis.inputSha256();
        final byte[] recordedDigest = artifact.sha256();
        if (
            !validDigest(expectedDigest) || !validDigest(recordedDigest)
                || !MessageDigest.isEqual(expectedDigest, recordedDigest)
        ) {
            return Mono.error(AskAiProblemException.contextNotFound());
        }
        return sourceArtifacts.findMetadataById(artifact.id())
            .filter(metadata -> metadataMatches(artifact, metadata))
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()))
            .flatMap(ignored -> openProject(artifact));
    }

    private Mono<LoadedProject> openProject(final SourceArtifact artifact) {
        return sourceArtifacts.open(artifact.sha256())
            .switchIfEmpty(Mono.error(AskAiProblemException.contextNotFound()))
            .flatMap(
                stream -> Mono.using(
                    () -> stream, owned -> analysisWork.submit(() -> applyToStream(artifact, owned)), this::closeQuietly
                )
            );
    }

    private LoadedProject applyToStream(final SourceArtifact artifact, final InputStream stream) throws IOException {
        final byte[] archive = readAndVerify(artifact, stream);
        final ProjectArchiveInspector.Inspection inspection;
        try {
            inspection = archiveInspector.inspect(archive);
        }
        catch (IOException | IllegalArgumentException | StackOverflowError exception) {
            throw AskAiProblemException.contextNotFound();
        }
        try {
            return new LoadedProject(
                parser.parseFromString(
                    RETAINED_PROGRAM_NAME, new String(inspection.projectJson(), StandardCharsets.UTF_8)
                ),
                inspection.thumbnailHashes()
            );
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw AskAiProblemException.contextNotFound();
        }
    }

    private byte[] readAndVerify(final SourceArtifact artifact, final InputStream stream) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream((int) artifact.byteSize());
        final MessageDigest digest = Digests.sha256();
        final byte[] buffer = new byte[8192];
        long size = 0;
        int read;
        while ((read = stream.read(buffer)) > 0) {
            size += read;
            if (size > MAX_INPUT_BYTES) {
                throw AskAiProblemException.contextNotFound();
            }
            digest.update(buffer, 0, read);
            output.write(buffer, 0, read);
        }
        if (size != artifact.byteSize() || !MessageDigest.isEqual(digest.digest(), artifact.sha256())) {
            throw AskAiProblemException.contextNotFound();
        }
        return output.toByteArray();
    }

    private boolean metadataMatches(final SourceArtifact artifact, final SourceArtifactMetadata metadata) {
        if (
            metadata.artifactId() != artifact.id() || metadata.sourceKind() == null || metadata.sourceKind().isBlank()
        ) {
            return false;
        }
        final String manifest = metadata.manifestJson();
        if (manifest == null || manifest.isBlank()) {
            return true;
        }
        if (manifest.getBytes(StandardCharsets.UTF_8).length > MAX_METADATA_BYTES) {
            return false;
        }
        try {
            final tools.jackson.databind.JsonNode root = tools.jackson.databind.json.JsonMapper.shared()
                .readTree(manifest);
            return root != null && root.isObject();
        }
        catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean validDigest(final byte[] digest) {
        return digest != null && digest.length == SHA256_BYTES;
    }

    private boolean isCompleted(final String status) {
        return "DONE".equals(status) || "COMPLETED".equals(status);
    }

    private boolean isRetainedSubmission(final Submission submission) {
        return submission != null && "ACTIVE".equalsIgnoreCase(submission.retentionState());
    }

    private static boolean isCapacityIssue(final Throwable cause) {
        return cause instanceof AnalysisCapacityExceededException
            || cause instanceof DatabaseCapacityExceededException
            || cause instanceof StorageCapacityExceededException
            || cause instanceof RejectedExecutionException;
    }

    private void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // Cleanup must not replace the stable response already computed.
        }
    }

    public record Authorized(Submission submission, Analysis analysis) {
    }

    /** Parsed project and costume hashes scoped to the authorized submission. */
    public record LoadedProject(Program program, Map<String, String> costumeHashes) {

        public LoadedProject {
            Objects.requireNonNull(program, "program");
            if (costumeHashes == null) {
                costumeHashes = Map.of();
            }
            else {
                costumeHashes = Map.copyOf(costumeHashes);
            }
        }
    }
}
