/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence;

import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SubmissionArtifactEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.SubmissionArtifacts;
import reactor.core.publisher.Mono;

@Repository
public class SubmissionArtifactRepository {

    private final SubmissionArtifacts links;
    private final Analyses analyses;
    private final DatabaseWork databaseWork;
    private final ReadCommittedTransactions transactions;

    @Autowired
    public SubmissionArtifactRepository(
        final SubmissionArtifacts links,
        final Analyses analyses,
        final DatabaseWork databaseWork,
        final ReadCommittedTransactions transactions
    ) {
        this.links = Objects.requireNonNull(links, "links");
        this.analyses = Objects.requireNonNull(analyses, "analyses");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
    }

    /**
     * Records that a submission was made from an artifact, and under what name. The artifact keeps the name of
     * whichever submission stored its bytes first, so the name this submission knows it by has to be kept here.
     *
     * @param submissionId     the submission
     * @param artifactId       the artifact it was made from
     * @param role             what the artifact is to the submission
     * @param originalFilename the name the submission gave the artifact, or {@code null} where it gave none
     * @return completes once the link is recorded, or was already
     */
    public Mono<Void> link(
        final long submissionId, final long artifactId, final String role, final String originalFilename
    ) {
        Objects.requireNonNull(role, "role");
        return databaseWork.submit(() -> {
            Idempotent.write(() -> links.link(submissionId, artifactId, role, originalFilename));
            return null;
        });
    }

    /**
     * The name a submission gave the artifact it was made from, if the link between them kept one.
     *
     * @param submissionId the submission
     * @param artifactId   the artifact it was made from
     * @return the name, or nothing where the link kept none
     */
    public Mono<String> findOriginalFilename(final long submissionId, final long artifactId) {
        return databaseWork.submit(() -> links.findOriginalFilename(submissionId, artifactId).orElse(null));
    }

    /**
     * The artifact a submission was built from, if it got that far.
     *
     * <p>
     * The link is the only durable record of which artifact a submission holds once the request that made it is gone. A
     * submission can hold two artifacts under this role: if creation stopped between linking and analysis, the repeat
     * that finishes it fetches the project from Scratch again and stores different bytes.
     */
    public Mono<Long> findOriginalArtifactId(final long submissionId) {
        return databaseWork.submit(() -> links.findArtifactId(submissionId, "ORIGINAL").orElse(null));
    }

    /**
     * Gives a batch project its analysis, creating one only if it has none.
     *
     * <p>
     * Looking first and then inserting is two decisions, and two workers can both look before either inserts. The
     * unique key on a named project within its submission makes the insert itself the decision.
     *
     * <p>
     * The loser has to look again in a fresh transaction: its own began before the winner committed and so cannot see
     * the row the error is complaining about.
     */
    public Mono<LinkedAnalysis> linkAnalysis(final BatchAnalysisLink link) {
        Objects.requireNonNull(link, "link");
        return databaseWork.submit(() -> {
            try {
                return transactions.execute(status -> linkAnalysisInTransaction(link));
            }
            catch (DataIntegrityViolationException lostTheRace) {
                return transactions.execute(status -> claimTheWinner(link, lostTheRace));
            }
        });
    }

    private LinkedAnalysis claimTheWinner(
        final BatchAnalysisLink link,
        final DataIntegrityViolationException lostTheRace
    ) {
        final Long winner = findAnalysis(link);
        if (winner == null) {
            throw lostTheRace;
        }
        return new LinkedAnalysis(winner, false);
    }

    private LinkedAnalysis linkAnalysisInTransaction(final BatchAnalysisLink link) {
        final Long existing = findAnalysis(link);
        if (existing != null) {
            return new LinkedAnalysis(existing, false);
        }
        // Two projects of one batch can be the same bytes under different names, in which case the link already
        // exists. Checked here rather than left to the insert, because a refused statement would roll back the
        // transaction that the analysis below is being created in. The link keeps no name: one link can stand for
        // several differently named projects, and each analysis carries its own.
        final SubmissionArtifactEntity.Key key = new SubmissionArtifactEntity.Key(
            link.submissionId(), link.artifactId(), link.role()
        );
        if (!links.existsById(key)) {
            links.link(link.submissionId(), link.artifactId(), link.role(), null);
        }
        final AnalysisEntity analysis = AnalysisEntity.queued(
            link.submissionId(), link.artifactId(), link.projectName(), "NEW", "1",
            link.litterboxArtifactVersion(), link.locale(), link.inputSha256(), link.inputFormat()
        );
        // Marks this analysis as the one that unpacking the batch created, which is what the unique key covers. An
        // analysis run over the same project later is not marked, and so is not refused.
        analysis.setFromCreation(true);
        return new LinkedAnalysis(analyses.saveAndFlush(analysis).getId(), true);
    }

    private Long findAnalysis(final BatchAnalysisLink link) {
        return analyses
            .findFirstBySubmissionIdAndProjectNameAndFromCreationIsTrueOrderById(
                link.submissionId(), link.projectName()
            )
            .map(AnalysisEntity::getId)
            .orElse(null);
    }

    public record BatchAnalysisLink(
        long submissionId,
        long artifactId,
        String role,
        String projectName,
        String litterboxArtifactVersion,
        String locale,
        byte[] inputSha256,
        String inputFormat
    ) {

        public BatchAnalysisLink {
            Objects.requireNonNull(role, "role");
            Objects.requireNonNull(projectName, "projectName");
            Objects.requireNonNull(litterboxArtifactVersion, "litterboxArtifactVersion");
            Objects.requireNonNull(locale, "locale");
            Objects.requireNonNull(inputSha256, "inputSha256");
            Objects.requireNonNull(inputFormat, "inputFormat");
            inputSha256 = inputSha256.clone();
        }

        @Override
        public byte[] inputSha256() {
            return inputSha256.clone();
        }
    }

    public record LinkedAnalysis(long analysisId, boolean created) {
    }
}
