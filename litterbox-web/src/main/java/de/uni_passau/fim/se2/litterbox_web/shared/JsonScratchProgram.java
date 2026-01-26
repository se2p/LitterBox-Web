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

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import com.fasterxml.jackson.annotation.JacksonAnnotationsInside;

import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonSerialize;

/**
 * Annotation for attributes that should be automatically converted from/to a Scratch project JSON.
 *
 * <p>
 * Allows annotating method parameters and attributes to mark them for automatic conversion from/to JSON as a Scratch
 * {@code project.json}. Convenience annotation to combine the relevant serialisation and deserialisation annotations as
 * described at {@link ScratchProgramConverter}.
 *
 * @see ScratchProgramConverter
 */
@JacksonAnnotationsInside
@JsonDeserialize(converter = ScratchProgramConverter.DeserializeConverter.class)
@JsonSerialize(converter = ScratchProgramConverter.SerializeConverter.class)
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.ANNOTATION_TYPE, ElementType.METHOD, ElementType.FIELD, ElementType.TYPE, ElementType.PARAMETER })
public @interface JsonScratchProgram {
}
