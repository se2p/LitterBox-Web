/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;

import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;

class LegacyProgramParseVerifierTest {

    private static final String VERSION = "1.13-synthetic";

    @Test
    void readsAProjectAndSaysWhichAnalyserReadIt(@TempDir final Path directory) throws Exception {
        final byte[] project = project();

        final LegacyArtifactReanalysisResult result = verify(project, "boatRace.json", directory);

        assertThat(result.parsed()).isTrue();
        assertThat(result.analysisVersion()).isEqualTo(VERSION);
    }

    /** The bytes are already known to be the ones that were uploaded, so this is a fact about the archive. */
    @Test
    void reportsSomethingThatIsNoLongerAProjectRatherThanThrowing(@TempDir final Path directory) throws Exception {
        final byte[] rubbish = "this was never a Scratch project".getBytes(StandardCharsets.UTF_8);

        final LegacyArtifactReanalysisResult result = verify(rubbish, "broken.sb3", directory);

        assertThat(result.parsed()).isFalse();
        assertThat(result.analysisVersion()).isEqualTo(VERSION);
    }

    /** The caller digests the stream afterwards to prove the copy is whole, which only works if it was read. */
    @Test
    void readsEveryByteItIsGiven(@TempDir final Path directory) throws Exception {
        final byte[] project = project();
        final CountingInputStream bytes = new CountingInputStream(project);

        verifier(VERSION).verify(input(bytes, "boatRace.json", directory));

        assertThat(bytes.count()).isEqualTo(project.length);
    }

    /**
     * A file whose name says nothing is offered as an SB3, that being what the old site took. This project is a bare
     * JSON, so read as an archive it does not open, and the verifier says so instead of failing.
     */
    @Test
    void treatsAFileOfUnknownNameAsAnArchive(@TempDir final Path directory) throws Exception {
        final LegacyArtifactReanalysisResult withoutName = verify(project(), null, directory);

        assertThat(withoutName.parsed()).isFalse();
    }

    @Test
    void refusesToStandInForTheOldReports() {
        assertThatThrownBy(
            () -> verifier(LegacyArtifactReanalysisVerifier.LEGACY_REPORT_VERSION)
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> verifier(" "))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private LegacyProgramParseVerifier verifier(final String version) {
        return new LegacyProgramParseVerifier(new Scratch3ParserService(), version);
    }

    private byte[] project() throws IOException {
        return Files.readAllBytes(
            new ClassPathResource("fixtures/scratch_programs/boatRace.json").getFile().toPath()
        );
    }

    private LegacyArtifactReanalysisResult verify(
        final byte[] bytes,
        final String filename,
        final Path directory
    ) throws IOException {
        return verifier(VERSION).verify(input(new ByteArrayInputStream(bytes), filename, directory));
    }

    private LegacyArtifactReanalysisInput input(
        final InputStream stream,
        final String filename,
        final Path directory
    ) {
        return new LegacyArtifactReanalysisInput(directory.resolve("stored"), stream, filename);
    }

    /**
     * Wraps rather than extends the array stream: a {@link ByteArrayInputStream} hands its whole buffer over in one go
     * when asked to transfer itself, and a subclass counting reads would never see it.
     */
    private static final class CountingInputStream extends FilterInputStream {

        private int read;

        CountingInputStream(final byte[] bytes) {
            super(new ByteArrayInputStream(bytes));
        }

        int count() {
            return read;
        }

        @Override
        public int read() throws IOException {
            final int result = super.read();
            if (result >= 0) {
                read++;
            }
            return result;
        }

        @Override
        public int read(final byte[] buffer, final int offset, final int length) throws IOException {
            final int result = super.read(buffer, offset, length);
            if (result > 0) {
                read += result;
            }
            return result;
        }
    }
}
