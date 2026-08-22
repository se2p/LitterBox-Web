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

import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.AnalysisEntity;
import de.uni_passau.fim.se2.litterbox_web.persistence.entity.SubmissionArtifactEntity;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.Analyses;
import de.uni_passau.fim.se2.litterbox_web.persistence.jpa.SubmissionArtifacts;
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

    public Mono<Void> link(final long submissionId, final long artifactId, final String role) {
        Objects.requireNonNull(role, "role");
        return databaseWork.submit(() -> {
            Idempotent.write(() -> links.link(submissionId, artifactId, role));
            return null;
        });
    }

    /**
     * The artifact a submission was built from, if the building got that far.
     *
     * <p>
     * The link is the durable record of which artifact a submission holds, and the only thing that answers this
     * question after the request that made it has gone. A submission whose creation stopped between linking and its
     * analysis is finished off by a repeat, and the repeat's own bytes are not necessarily these: a project fetched
     * from Scratch twice is two files, and building around the second left the submission holding two artifacts, both
     * under the role that means the one it was made from.
     */
    public Mono<Long> findOriginalArtifactId(final long submissionId) {
        return databaseWork.submit(() -> links.findArtifactId(submissionId, "ORIGINAL").orElse(null));
    }

    /**
     * Gives a batch project its analysis, making one only if it has none.
     *
     * <p>
     * Looking first and then inserting is two decisions, and two workers can both look before either inserts. The
     * unique key on the creation of a named project within its submission makes the insert itself the decision, and the
     * loser is told so.
     *
     * <p>
     * The loser has to look again from outside: its own transaction began before the winner committed and cannot see
     * what the winner wrote, however plainly the error says it is there.
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
        // Two projects of one batch can be the same bytes under different names, and then the link is already there.
        // Asked here rather than left to the insert, because a refused statement would take this transaction with it,
        // and the analysis being created below is what the transaction is for.
        final SubmissionArtifactEntity.Key key = new SubmissionArtifactEntity.Key(
            link.submissionId(), link.artifactId(), link.role()
        );
        if (!links.existsById(key)) {
            links.link(link.submissionId(), link.artifactId(), link.role());
        }
        final AnalysisEntity analysis = AnalysisEntity.queued(
            link.submissionId(), link.artifactId(), link.projectName(), "NEW", "1",
            link.litterboxArtifactVersion(), link.locale(), link.inputSha256(), link.inputFormat()
        );
        // Unpacking the batch is what created this project, and marking it so is what the unique key that keeps two
        // workers from both creating it is written over. An analysis run over the project afterwards is not marked,
        // and is not refused.
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
