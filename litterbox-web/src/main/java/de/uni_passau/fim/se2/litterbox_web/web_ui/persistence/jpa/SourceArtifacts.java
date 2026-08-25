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

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.SourceArtifactEntity;

public interface SourceArtifacts extends JpaRepository<SourceArtifactEntity, Long> {

    Optional<SourceArtifactEntity> findBySha256(byte[] sha256);
}
