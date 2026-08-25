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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.AnalysisAssets;
import de.uni_passau.fim.se2.litterbox_web.web_ui.persistence.jpa.Assets;
import de.uni_passau.fim.se2.litterbox_web.web_ui.support.SandboxedSvg;
import de.uni_passau.fim.se2.litterbox_web.web_ui.util.ImmediateWork;

/**
 * The admission check is only worth anything if nothing reaches the table past it, so what is asserted here is the
 * order: a costume that fails is not written and then judged, it is never written at all.
 */
class AssetRepositoryTest {

    private Assets assets;
    private AssetRepository repository;

    @BeforeEach
    void buildRepository() {
        assets = mock(Assets.class);
        repository = new AssetRepository(assets, mock(AnalysisAssets.class), ImmediateWork.database());
    }

    @Test
    void storesACostumeTheAdmissionCheckAccepts() {
        final byte[] costume = svg("<rect width=\"4\" height=\"4\" fill=\"#00a9c7\"/>");

        final Asset stored = repository.save(write(costume, null, SandboxedSvg.MEDIA_TYPE)).block();

        assertThat(stored).isNotNull().satisfies(
            asset -> assertThat(asset.mediaType()).isEqualTo(SandboxedSvg.MEDIA_TYPE)
        );

        verify(assets).store(any(), eq(null), eq("svg"), eq(SandboxedSvg.MEDIA_TYPE), anyLong(), any());
    }

    @Test
    void storesACostumeUnderTheScratchNameItIsKnownBy() {
        final byte[] costume = svg("<rect width=\"4\" height=\"4\"/>");
        final String md5 = HexFormat.of().formatHex(Digests.of("MD5").digest(costume));

        final Asset stored = repository.save(write(costume, md5, SandboxedSvg.MEDIA_TYPE)).block();

        assertThat(stored).isNotNull().satisfies(asset -> assertThat(asset.scratchMd5()).isEqualTo(md5));

        verify(assets).store(any(), eq(md5), any(), any(), anyLong(), any());
    }

    @Test
    void neverStoresACostumeCarryingActiveMarkup() {
        rejects(
            write(svg("<script>alert(1)</script>"), null, SandboxedSvg.MEDIA_TYPE),
            "not a supported raster or sandboxed vector image"
        );
    }

    @Test
    void neverStoresACostumeReachingOutsideItself() {
        rejects(
            write(svg("<image xlink:href=\"https://example.invalid/ping\"/>"), null, SandboxedSvg.MEDIA_TYPE),
            "not a supported raster or sandboxed vector image"
        );
    }

    /**
     * The declared media type is what the asset endpoint later answers with, and a costume served as something the
     * check never read it as would be a document arriving where a picture was promised.
     */
    @Test
    void neverStoresContentUnderAMediaTypeItIsNot() {
        rejects(write(svg("<rect width=\"4\" height=\"4\"/>"), null, "image/png"), "media type does not match");
    }

    @Test
    void neverStoresAMediaTypeThatIsNotServable() {
        rejects(
            write("<html>synthetic</html>".getBytes(StandardCharsets.UTF_8), null, "text/html"),
            "Only raster or sandboxed vector thumbnails"
        );
    }

    @Test
    void neverStoresContentThatIsNotWhatItsDigestSays() {
        final byte[] costume = svg("<rect width=\"4\" height=\"4\"/>");
        final AssetRepository.AssetWrite mislabelled = new AssetRepository.AssetWrite(
            sha256("something else".getBytes(StandardCharsets.UTF_8)), null, "svg", SandboxedSvg.MEDIA_TYPE, costume
        );

        rejects(mislabelled, "SHA-256 does not match");
    }

    @Test
    void neverStoresAScratchNameThatIsNotTheContent() {
        rejects(
            write(svg("<rect width=\"4\" height=\"4\"/>"), "0".repeat(32), SandboxedSvg.MEDIA_TYPE),
            "MD5 does not match"
        );
    }

    private void rejects(final AssetRepository.AssetWrite asset, final String reason) {
        assertThatThrownBy(() -> repository.save(asset).block())
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(reason);
        verify(assets, never()).store(any(), any(), any(), any(), anyLong(), any());
    }

    private static AssetRepository.AssetWrite write(
        final byte[] content, final String scratchMd5, final String mediaType
    ) {
        return new AssetRepository.AssetWrite(sha256(content), scratchMd5, "svg", mediaType, content);
    }

    private static byte[] svg(final String body) {
        return ("<svg xmlns=\"http://www.w3.org/2000/svg\">" + body + "</svg>").getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] sha256(final byte[] content) {
        return Digests.of("SHA-256").digest(content);
    }
}
