/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisMetricEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Says outright that these rows are new, which is what lets the configured batch size apply to them.
 */
class AnalysisMetricsBatchImpl implements AnalysisMetricsBatch {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public void insertAll(final List<AnalysisMetricEntity> metrics) {
        for (final AnalysisMetricEntity metric : metrics) {
            entityManager.persist(metric);
        }
        // Sent here rather than whenever the surrounding transaction happens to end, so that a measurement the
        // database refuses is reported against the call that wrote it.
        entityManager.flush();
    }
}
