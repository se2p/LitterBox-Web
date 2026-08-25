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

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AnalysisMetricEntity;

/**
 * Writing an analysis's measurements, all of which are new.
 *
 * <p>
 * A metric's key is the analysis it belongs to and its name, both of which the caller supplies, so {@code save} cannot
 * tell a new row from one already stored and asks the database about each in turn before writing it. A report carries a
 * hundred or so measurements and they are always written together after the old ones have been deleted, so there is
 * nothing to ask about.
 */
public interface AnalysisMetricsBatch {

    void insertAll(List<AnalysisMetricEntity> metrics);
}
