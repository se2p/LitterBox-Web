/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.shared;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import de.uni_passau.fim.se2.litterbox.jsoncreation.JSONStringCreator;
import io.micrometer.core.annotation.Timed;
import tools.jackson.databind.util.StdConverter;

// @formatter:off
// Spotless mangles the `@` inside the {@code } blocks
/**
 * Provides the necessary converters to automatically serialize and deserialize Scratch projects using Jackson.
 * <p>
 * With this you can add the {@link Program} directly as the {@code RequestBody} of a REST endpoint.
 * You might want to use {@link JsonScratchProgram} instead of using this converter directly.
 * <p>
 * <h2>Example</h2>
 * <p>Defining a data container class with the converter annotations on the attribute that holds the
 * {@link Program}
 *
 * <pre>{@code
 * record Data(
 *     @JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class)
 *     @JsonDeserialize(converter = ScratchProgramConverter.DeserializeConverter.class)
 *     Program program,
 *     // other attributes
 * ) {}
 * }</pre>
 *
 * allows you to define a rest controller method like
 *
 * <pre>{@code
 * @PostMapping("a/b/c")
 * SomeReturnType handleRequest(@RequestBody final Data request) {
 *     // implementation
 * }
 * }</pre>
 *
 * or
 *
 * <pre>{@code
 * @GetMapping("a/b/c")
 * Data handleRequest(...) {
 *     // implementation
 * }
 * }</pre>
 *
 * to automatically handle the parsing of the Scratch program from and to JSON.
 *
 * @see JsonScratchProgram
 */
// @formatter:on
public class ScratchProgramConverter {

    private static final Scratch3Parser PARSER = new Scratch3Parser();

    private ScratchProgramConverter() {
        // utility class, intentionally empty
    }

    public static class SerializeConverter extends StdConverter<Program, String> {

        @Timed
        @Override
        public String convert(Program program) {
            return JSONStringCreator.createProgramJSONString(program);
        }
    }

    public static class DeserializeConverter extends StdConverter<String, Program> {

        @Timed
        @Override
        public Program convert(String value) {
            try {
                return PARSER.parseString("scratch-program", value);
            }
            catch (NullPointerException | ParsingException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot parse Scratch program JSON.", e);
            }
        }
    }
}
