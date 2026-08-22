/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.persistence.jpa;

import java.util.Optional;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import de.uni_passau.fim.se2.litterbox_web.persistence.entity.AssetEntity;

/**
 * Deliberately a bare {@link Repository} rather than a {@code JpaRepository}: the two methods below are the whole of
 * what the asset table may be asked to do.
 *
 * <p>
 * Inheriting the CRUD interface would have added {@code save}, {@code delete} and the batch mutations beside them, and
 * every one of those is a way to put bytes in the table without passing the admission check that
 * {@code AssetRepository} runs first. A costume is learner-supplied content that is later served back to a browser, so
 * the check being unavoidable is the point, and a method that skips it is not a convenience.
 */
public interface Assets extends Repository<AssetEntity, byte[]> {

    /**
     * The same picture arrives again and again, from different projects and sometimes with a name attached and
     * sometimes not. Whatever is known about it is kept and nothing known is lost.
     */
    @Modifying
    @Transactional
    @Query(
        value = "INSERT INTO asset (sha256, scratch_md5, extension, media_type, byte_size, content) "
            + "VALUES (:sha256, :scratchMd5, :extension, :mediaType, :byteSize, :content) "
            + "ON DUPLICATE KEY UPDATE scratch_md5 = COALESCE(asset.scratch_md5, VALUES(scratch_md5)), "
            + "extension = COALESCE(asset.extension, VALUES(extension)), "
            + "media_type = COALESCE(asset.media_type, VALUES(media_type))",
        nativeQuery = true
    )
    @SuppressWarnings("checkstyle:ParameterNumber")
    void store(
        @Param("sha256") byte[] sha256,
        @Param("scratchMd5") String scratchMd5,
        @Param("extension") String extension,
        @Param("mediaType") String mediaType,
        @Param("byteSize") long byteSize,
        @Param("content") byte[] content
    );

    /**
     * An asset is only shown to somebody holding a token for a submission that led to it. The join is the permission
     * check, so it belongs in the same statement as the read rather than beside it.
     */
    @Query(
        value = "SELECT asset.* FROM asset "
            + "JOIN analysis_asset ON analysis_asset.asset_sha256 = asset.sha256 "
            + "JOIN analysis ON analysis.id = analysis_asset.analysis_id "
            + "JOIN submission ON submission.id = analysis.submission_id "
            + "WHERE submission.share_token = :token AND asset.sha256 = :sha256",
        nativeQuery = true
    )
    Optional<AssetEntity> findForSubmission(@Param("token") String token, @Param("sha256") byte[] sha256);
}
