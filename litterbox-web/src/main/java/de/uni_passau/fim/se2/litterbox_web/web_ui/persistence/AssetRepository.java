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

import java.security.MessageDigest;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Repository;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.entity.AssetEntity;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisAssets;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Assets;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.SandboxedSvg;
import reactor.core.publisher.Mono;

@Repository
public class AssetRepository {

    private static final String SHA256_COLUMN = "sha256";

    private final Assets assets;
    private final AnalysisAssets analysisAssets;
    private final DatabaseWork databaseWork;

    public AssetRepository(
        final Assets assets,
        final AnalysisAssets analysisAssets,
        final DatabaseWork databaseWork
    ) {
        this.assets = Objects.requireNonNull(assets, "assets");
        this.analysisAssets = Objects.requireNonNull(analysisAssets, "analysisAssets");
        this.databaseWork = Objects.requireNonNull(databaseWork, "databaseWork");
    }

    public Mono<Asset> save(final AssetWrite asset) {
        Objects.requireNonNull(asset, "asset");
        return databaseWork.submit(() -> saveAsset(asset));
    }

    private Asset saveAsset(final AssetWrite asset) {
        final byte[] content = asset.content();
        validate(asset, content);
        assets.store(
            asset.sha256(), asset.scratchMd5(), asset.extension(), asset.mediaType(), content.length, content
        );
        return new Asset(
            asset.sha256(), asset.scratchMd5(), asset.extension(), asset.mediaType(), content.length, content
        );
    }

    private void validate(final AssetWrite asset, final byte[] content) {
        if (!MessageDigest.isEqual(asset.sha256(), digest("SHA-256", content))) {
            throw new IllegalArgumentException("Asset SHA-256 does not match its content");
        }
        validateMd5(asset, content);
        if (!safeMediaType(asset.mediaType())) {
            throw new IllegalArgumentException("Only raster or sandboxed vector thumbnails may be stored");
        }
        if (!asset.mediaType().equals(mediaType(content))) {
            throw new IllegalArgumentException("Asset media type does not match its content");
        }
    }

    private void validateMd5(final AssetWrite asset, final byte[] content) {
        if (asset.scratchMd5() == null) {
            return;
        }
        if (!asset.scratchMd5().matches("[0-9a-fA-F]{32}")) {
            throw new IllegalArgumentException("Asset MD5 does not match its content");
        }
        if (!java.util.HexFormat.of().formatHex(digest("MD5", content)).equalsIgnoreCase(asset.scratchMd5())) {
            throw new IllegalArgumentException("Asset MD5 does not match its content");
        }
    }

    private boolean safeMediaType(final String mediaType) {
        return Set.of("image/png", "image/jpeg", "image/gif", "image/webp", SandboxedSvg.MEDIA_TYPE)
            .contains(mediaType);
    }

    private byte[] digest(final String algorithm, final byte[] content) {
        return Digests.of(algorithm).digest(content);
    }

    private String mediaType(final byte[] content) {
        if (startsWith(content, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return "image/png";
        }
        if (startsWith(content, 0xFF, 0xD8, 0xFF)) {
            return "image/jpeg";
        }
        if (
            startsWith(content, 'G', 'I', 'F', '8', '7', 'a')
                || startsWith(content, 'G', 'I', 'F', '8', '9', 'a')
        ) {
            return "image/gif";
        }
        if (startsWith(content, 'R', 'I', 'F', 'F') && startsWithAt(content, 8, 'W', 'E', 'B', 'P')) {
            return "image/webp";
        }
        if (SandboxedSvg.isPreviewable(content)) {
            return SandboxedSvg.MEDIA_TYPE;
        }
        throw new IllegalArgumentException("Asset is not a supported raster or sandboxed vector image");
    }

    private static boolean startsWith(final byte[] content, final int... signature) {
        return startsWithAt(content, 0, signature);
    }

    private static boolean startsWithAt(final byte[] content, final int offset, final int... signature) {
        if (content.length < offset + signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if (content[offset + index] != (byte) signature[index]) {
                return false;
            }
        }
        return true;
    }

    public Mono<Void> linkToAnalysis(final long analysisId, final byte[] sha256, final String role) {
        Objects.requireNonNull(sha256, SHA256_COLUMN);
        Objects.requireNonNull(role, "role");
        return databaseWork.submit(() -> {
            Idempotent.write(() -> analysisAssets.link(analysisId, sha256, role));
            return null;
        });
    }

    public Mono<Asset> findForSubmission(final String token, final byte[] sha256) {
        Objects.requireNonNull(token, "token");
        Objects.requireNonNull(sha256, SHA256_COLUMN);
        return databaseWork.submit(
            () -> assets.findForSubmission(token, sha256).map(AssetRepository::toAsset).orElse(null)
        );
    }

    private static Asset toAsset(final AssetEntity entity) {
        return new Asset(
            entity.getSha256(), entity.getScratchMd5(), entity.getExtension(), entity.getMediaType(),
            entity.getByteSize(), entity.getContent()
        );
    }

    public record AssetWrite(byte[] sha256, String scratchMd5, String extension, String mediaType, byte[] content) {

        public AssetWrite {
            Objects.requireNonNull(sha256, SHA256_COLUMN);
            Objects.requireNonNull(content, "content");
            if (sha256.length != 32) {
                throw new IllegalArgumentException("SHA-256 digest must contain 32 bytes");
            }
            sha256 = sha256.clone();
            content = content.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }
}
