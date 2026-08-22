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

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Objects;

import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;

/**
 * Reads every copied project with the analyser that is going to have to serve it.
 *
 * <p>
 * Parsing is the whole of the check. It is what tells apart an archive that survived the move from one that is merely
 * the right number of bytes, and it is the step that fails when an old upload is of a kind this version no longer
 * recognises. Running the finders as well would take hours across the archive and answer nothing this does not.
 *
 * <p>
 * A project that will not parse is reported, not thrown: its bytes are already proven identical to the original, so the
 * copy is sound and it is the reading of it that has moved on. Whoever runs the migration can see how many there are
 * and decide.
 */
final class LegacyProgramParseVerifier implements LegacyArtifactReanalysisVerifier {

    private final Scratch3ParserService parser;
    private final String analysisVersion;

    LegacyProgramParseVerifier(final Scratch3ParserService parser, final String analysisVersion) {
        this.parser = Objects.requireNonNull(parser, "parser");
        this.analysisVersion = Objects.requireNonNull(analysisVersion, "analysisVersion");
        if (analysisVersion.isBlank() || LEGACY_REPORT_VERSION.equals(analysisVersion)) {
            throw new IllegalArgumentException("analysisVersion must name the analyser doing the reading");
        }
    }

    @Override
    public LegacyArtifactReanalysisResult verify(final LegacyArtifactReanalysisInput input) throws IOException {
        // Stored artifacts are addressed by content, so the copy on disk has no extension and the parser chooses by
        // extension. The bytes are handed over as a stream in any case, and draining it is what proves the file
        // reads back whole.
        final Path scratch = Files.createTempFile("litterbox-legacy-", extension(input.originalFilename()));
        try {
            copy(input.bytes(), scratch);
            return new LegacyArtifactReanalysisResult(analysisVersion, parses(scratch));
        }
        finally {
            Files.deleteIfExists(scratch);
        }
    }

    private void copy(final InputStream bytes, final Path target) throws IOException {
        try (InputStream source = bytes) {
            Files.copy(source, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private boolean parses(final Path file) {
        try {
            return parser.parseFromFile(file) != null;
        }
        catch (RuntimeException exception) {
            return false;
        }
    }

    /**
     * The suffix of the uploaded name, which is all the parser wants from it. Anything else is offered as an SB3, that
     * being what the old site accepted and what an archive of unknown name most likely is.
     */
    private String extension(final String originalFilename) {
        if (originalFilename == null) {
            return ".sb3";
        }
        final int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return ".sb3";
        }
        final String suffix = originalFilename.substring(dot).toLowerCase(Locale.ROOT);
        return suffix.matches("\\.[a-z0-9]{1,10}") ? suffix : ".sb3";
    }
}
