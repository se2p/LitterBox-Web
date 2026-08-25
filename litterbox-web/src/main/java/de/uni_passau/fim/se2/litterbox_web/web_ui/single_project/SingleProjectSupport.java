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

/**
 * The few things every part of the single-project workflow needs: what to call a state, what a file's extension is, how
 * much of a stream may be read, and what may safely be said about a failure.
 *
 * These sit together because taking a submission in, running its analysis and reading the result back all need them,
 * and none of the three owns them.
 */
public final class SingleProjectSupport {

    /**
     * The cap on generated questions. Named here because the number is written into the configuration recorded against
     * an analysis as well as used when questions are regenerated to mark an answer; two copies of it could drift apart,
     * and a question set regenerated against a different cap is not the one the reader was shown.
     */
    static final int MAX_GENERATED_QUESTIONS = 300;

    /**
     * The largest project this service will accept, retain or read back. One number, because a limit that is enforced
     * at the door and a different one enforced when the bytes are read again is a project that can be taken in and then
     * never looked at.
     */
    public static final int MAX_PROJECT_BYTES = 50 * 1024 * 1024;

    private SingleProjectSupport() {
    }

    /**
     * The word the API uses for a state, which is not the word the database uses. A row can hold DONE or COMPLETED
     * depending on when it was written, and a reader should never have to know that.
     */
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

    /** Only two formats are analysed, so anything that is not an mBlock project is treated as a Scratch one. */
    static String extension(final String filename) {
        return filename.toLowerCase(Locale.ROOT).endsWith(".mblock") ? ".mblock" : ".sb3";
    }

    /**
     * What may be repeated back about a failure. Bounded because the message may have come from a parser that quotes
     * the input, and the input is somebody's project. The fallback is the caller's, because a failure with nothing to
     * say still has to be described as the thing that failed.
     */
    static String safeMessage(final Throwable error, final String fallback) {
        final String message = error.getMessage();
        return message == null ? fallback : message.substring(0, Math.min(message.length(), 1000));
    }

    /** A digest of some content, by name. Absent algorithms are a broken runtime rather than a bad project. */
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

    /** A stream that has done its job. The processing outcome stays authoritative if closing it does not. */
    static void closeQuietly(final InputStream stream) {
        try {
            stream.close();
        }
        catch (IOException ignored) {
            // The processing outcome remains authoritative if cleanup fails.
        }
    }

    /**
     * A project read back out of what was retained, for a second look at it: a report to download, or a question to be
     * marked against the program it was generated from. The archive is inspected before it is written out, because a
     * retained source is still a source.
     */
    static Program parseStoredProgram(
        final Scratch3ParserService parser,
        final ProjectArchiveInspector archiveInspector,
        final byte[] bytes,
        final String filename,
        final String inputFormat
    ) throws IOException {
        if ("json".equalsIgnoreCase(inputFormat)) {
            return parser.parseFromString(filename, new String(bytes, StandardCharsets.UTF_8));
        }
        archiveInspector.inspect(bytes);
        final Path temporary = Files.createTempFile("litterbox-single-report-", extension(filename));
        try {
            Files.write(temporary, bytes);
            return parser.parseFromFile(temporary);
        }
        finally {
            Files.deleteIfExists(temporary);
        }
    }

    /**
     * The whole question set, not a sample: a teacher needs to see which block-model cells a project covers, and the
     * reader's own page picks its handful out of the same answer. The cap only guards against a pathological project.
     * Shared because a question is generated once when the analysis runs and again when an answer to it is marked, and
     * the two have to agree.
     */
    static List<QuestionDTO> generateQuestions(
        final QlcService qlc,
        final Program program,
        final String locale
    ) {
        return qlc.getQuestions(
            program, Locale.of(locale), null, Set.of(), Set.of(), MAX_GENERATED_QUESTIONS,
            false, 0, false, 0L
        ).stream().filter(SingleProjectSupport::markable).toList();
    }

    /**
     * Whether an answer to this question could be marked at all.
     *
     * Two kinds cannot. One carries no type, so there is no rule to mark it by. The other carries no expected answer,
     * so every answer to it is wrong: a reader is asked something and then told they got it wrong whatever they said.
     *
     * Neither is a question this service can honour, so neither is exported. Doing it here rather than where the set is
     * displayed means the same set is used to ask and to mark, which is what lets an answer be checked against the
     * question the reader actually saw.
     */
    static boolean markable(final QuestionDTO question) {
        if (question == null || question.type() == null) {
            return false;
        }
        final List<String> answers = question.correctAnswers();
        return answers != null && answers.stream().anyMatch(answer -> answer != null && !answer.isBlank());
    }
}
