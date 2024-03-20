/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.shared;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.type.TypeFactory;
import com.fasterxml.jackson.databind.util.Converter;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import de.uni_passau.fim.se2.litterbox.jsoncreation.JSONStringCreator;
import io.micrometer.core.annotation.Timed;

// @formatter:off
// Spotless mangles the `@` inside the {@code } blocks
/**
 * Provides the necessary converters to automatically serialize and deserialize Scratch projects using Jackson.
 * <p>
 * With this you can add the {@link Program} directly as the {@code RequestBody} of a REST endpoint.
 * <p>
 * <h2>Example</h2>
 * <p>Defining a data container class with the converter annotations on the attribute that holds the
 * {@link Program}
 *
 * <pre>{@code
 * record Data(
 *     @JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class)
 *     @JsonDeserialize( converter = ScratchProgramConverter.DeserializeConverter.class)
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
 */
// @formatter:on
public class ScratchProgramConverter {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Scratch3Parser PARSER = new Scratch3Parser();

    private ScratchProgramConverter() {
        throw new IllegalCallerException("utility class");
    }

    public static class SerializeConverter implements Converter<Program, String> {

        @Timed
        @Override
        public String convert(Program program) {
            return JSONStringCreator.createProgramJSONString(program);
        }

        @Override
        public JavaType getInputType(TypeFactory typeFactory) {
            return OBJECT_MAPPER.getTypeFactory().constructType(Program.class);
        }

        @Override
        public JavaType getOutputType(TypeFactory typeFactory) {
            return OBJECT_MAPPER.getTypeFactory().constructType(String.class);
        }
    }

    public static class DeserializeConverter implements Converter<String, Program> {

        @Timed
        @Override
        public Program convert(String string) {
            try {
                return PARSER.parseString("scratch-program", string);
            }
            catch (ParsingException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot parse Scratch program JSON.", e);
            }
        }

        @Override
        public JavaType getInputType(TypeFactory typeFactory) {
            return OBJECT_MAPPER.getTypeFactory().constructType(String.class);
        }

        @Override
        public JavaType getOutputType(TypeFactory typeFactory) {
            return OBJECT_MAPPER.getTypeFactory().constructType(Program.class);
        }
    }
}
