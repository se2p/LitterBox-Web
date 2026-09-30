/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.single_project;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox_web.qlc.QlcService;
import de.uni_passau.fim.se2.litterbox_web.qlc.QuestionDTO;
import de.uni_passau.fim.se2.litterbox_web.shared.Scratch3ParserService;

public final class SingleProjectSupport {

    /**
     * Named here rather than duplicated: it is written into the analysis's stored configuration and reused when
     * questions are regenerated to mark an answer.
     */
    static final int MAX_GENERATED_QUESTIONS = 300;

    /** One number, so the limit enforced at the door cannot differ from the one enforced when bytes are read back. */
    public static final int MAX_PROJECT_BYTES = 50 * 1024 * 1024;

    private SingleProjectSupport() {
    }

    /** A stored row can hold DONE or COMPLETED depending on when it was written; both are read as completed here. */
    static String status(final String value) {
        return switch (value) {
            case "DONE", "COMPLETED" -> "completed";
            case "FAILED" -> "failed";
            case "PARTIAL" -> "partial";
            case "CANCELLED" -> "cancelled";
            case "RUNNING" -> "processing";
            default -> "queued";
        };
    }

    /**
     * A name to hand a stored project to the parser under. A project whose name is not known still has the format it
     * was recorded in, and that is all the parser reads from the name.
     */
    static String usableFilename(final String filename, final String inputFormat) {
        if (filename != null && !filename.isBlank()) {
            return filename;
        }
        if (inputFormat != null && inputFormat.startsWith(".")) {
            return "project" + inputFormat;
        }
        return "project.sb3";
    }

    /** Only two formats are analysed, so anything that is not an mBlock project is treated as a Scratch one. */
    static String extension(final String filename) {
        if (filename.toLowerCase(Locale.ROOT).endsWith(".mblock")) {
            return ".mblock";
        }
        else {
            return ".sb3";
        }
    }

    /** Bounded because the message may quote the input, and the input is somebody's project. */
    static String safeMessage(final Throwable error, final String fallback) {
        final String message = error.getMessage();
        if (message == null) {
            return fallback;
        }
        else {
            return message.substring(0, Math.min(message.length(), 1000));
        }
    }

    /** Absent algorithms are a broken runtime rather than a bad project. */
    static byte[] digest(final String algorithm, final byte[] content) {
        try {
            return MessageDigest.getInstance(algorithm).digest(content);
        }
        catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(algorithm + " is unavailable", error);
        }
    }

    /** Reads a stream, refusing rather than growing without bound: the source is not this service's to trust. */
    static byte[] readLimited(final InputStream source, final int limit) throws IOException {
        final ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(limit, 8192));
        final byte[] buffer = new byte[8192];
        int read;
        while ((read = source.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            if (output.size() > limit - read) {
                throw new IllegalArgumentException("Retained source exceeds the analysis limit");
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    /** The processing outcome stays authoritative even if closing this stream fails. */
    static void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // No action needed.
        }
    }

    /** Inspected again before being parsed, because a retained source is still a source. */
    static Program parseStoredProgram(
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final byte[] bytes,
        final String filename,
        final String inputFormat
    ) throws IOException {
        if ("json".equalsIgnoreCase(inputFormat)) {
            return parser.parseFromString(
                usableFilename(filename, inputFormat), new String(bytes, StandardCharsets.UTF_8)
            );
        }
        archiveInspector.inspect(bytes);
        final Path temporary = Files.createTempFile(
            "litterbox-single-report-", extension(usableFilename(filename, inputFormat))
        );
        try {
            Files.write(temporary, bytes);
            return parser.parseFromFile(temporary);
        }
        finally {
            Files.deleteIfExists(temporary);
        }
    }

    /**
     * Shared because a question is generated once when the analysis runs and again when an answer is marked, and the
     * two must agree.
     */
    static List<QuestionDTO> generateQuestions(
        final QlcService qlc,
        final Program program,
        final String locale
    ) {
        return qlc.getQuestions(
            program, Locale.of(locale), null, Set.of(), Set.of(), MAX_GENERATED_QUESTIONS,
            false, 0, false, 0L
        ).filter(SingleProjectSupport::markable).toList();
    }

    /** Filtered here rather than where the set is displayed, so the same set is used both to ask and to mark. */
    static boolean markable(final QuestionDTO question) {
        if (question == null || question.type() == null) {
            return false;
        }
        final List<String> answers = question.correctAnswers();
        return answers != null && answers.stream().anyMatch(answer -> answer != null && !answer.isBlank());
    }
}
