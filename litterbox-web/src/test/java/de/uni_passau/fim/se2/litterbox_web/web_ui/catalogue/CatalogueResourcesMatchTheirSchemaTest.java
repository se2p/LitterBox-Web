/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.catalogue;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Holds every checked-in catalogue resource against {@code catalogue.schema.json}.
 *
 * <p>
 * The resources and the schema ship in the same commit, so a resource that does not match its schema is a mistake
 * someone made while editing the catalogue, not a condition a running server can encounter. Checking it here says the
 * same thing the loader used to say at start-up, at the moment the mistake is made and without the server carrying a
 * validator it can never exercise.
 *
 * <p>
 * The documents come from the loader's own {@link PatternCatalogueLoader.ClasspathResourceSource}, so the set checked
 * here is by construction the set the loader reads: every {@code i18n/} locale overlay.
 */
class CatalogueResourcesMatchTheirSchemaTest {

    private static final String SCHEMA_RESOURCE = "litterbox-web-catalogue/catalogue.schema.json";
    private static final JsonMapper MAPPER = JsonMapper.shared();

    private static final PatternCatalogueLoader.ResourceSource RESOURCES = new PatternCatalogueLoader.ClasspathResourceSource(
        CatalogueResourcesMatchTheirSchemaTest.class.getClassLoader()
    );

    @Test
    void everyLocaleOverlayMatchesTheSchema() throws IOException {
        final JsonNode schema = schema();
        final List<PatternCatalogueLoader.ResourceDocument> documents = RESOURCES.resources("i18n");
        final List<String> failures = new ArrayList<>();
        for (PatternCatalogueLoader.ResourceDocument document : documents) {
            try {
                validateNode(parse(document.content()), schema, "$");
            }
            catch (SchemaViolation violation) {
                failures.add(document.name() + ": " + violation.getMessage());
            }
        }

        assertThat(documents).as("catalogue resources in i18n").isNotEmpty();
        assertThat(failures).isEmpty();
    }

    /**
     * A schema every document passes says nothing about the documents. These are the edits someone actually makes to
     * the catalogue and gets wrong -- a required field left out, a field the loader does not read -- and each has to be
     * a mistake the schema names rather than one the reader finds.
     */
    @Test
    void theSchemaRejectsDocumentsTheLoaderCouldNotUse() throws IOException {
        final JsonNode schema = schema();

        assertThat(conforms(json("{\"finderId\": \"blocking_if_else\", \"locale\": \"en\"}"), schema)).isTrue();
        assertThat(conforms(json("{\"locale\": \"en\"}"), schema)).isFalse();
        assertThat(conforms(json("{\"finderId\": \"blocking_if_else\"}"), schema)).isFalse();
        assertThat(conforms(json("{\"finderId\": \"\", \"locale\": \"en\"}"), schema)).isFalse();
        // A document describing the finder rather than describing it in a language. Nothing reads these fields.
        assertThat(
            conforms(json("{\"finderId\": \"blocking_if_else\", \"locale\": \"en\", \"aliases\": []}"), schema)
        ).isFalse();
        assertThat(
            conforms(
                json("{\"finderId\": \"blocking_if_else\", \"locale\": \"en\", \"examples\": [{\"label\": \"L\"}]}"),
                schema
            )
        ).isFalse();
    }

    @Test
    void everySupportedLocaleIsRepresentedAmongTheOverlays() throws IOException {
        final Set<String> locales = new TreeSet<>();
        for (PatternCatalogueLoader.ResourceDocument document : RESOURCES.resources("i18n")) {
            locales.add(parse(document.content()).path("locale").textValue());
        }

        assertThat(locales).containsAll(PatternCatalogueLoader.SUPPORTED_LOCALES);
    }

    private static boolean conforms(final JsonNode value, final JsonNode schema) {
        try {
            validateNode(value, schema, "$");
            return true;
        }
        catch (SchemaViolation violation) {
            return false;
        }
    }

    private static JsonNode schema() throws IOException {
        final ClassLoader classLoader = CatalogueResourcesMatchTheirSchemaTest.class.getClassLoader();
        try (InputStream input = classLoader.getResourceAsStream(SCHEMA_RESOURCE)) {
            assertThat(input).as(SCHEMA_RESOURCE).isNotNull();
            return MAPPER.readTree(input);
        }
    }

    private static JsonNode parse(final byte[] content) throws IOException {
        try (InputStream input = new ByteArrayInputStream(content)) {
            return MAPPER.readTree(input);
        }
    }

    private static JsonNode json(final String content) {
        return MAPPER.readTree(content);
    }

    private static void validateNode(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        validateType(value, schema, location);
        validateRequired(value, schema, location);
        validateProperties(value, schema, location);
        validateItems(value, schema, location);
        validateMinLength(value, schema, location);
        validateUniqueItems(value, schema, location);
        validateEnum(value, schema, location);
    }

    private static void validateType(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode type = schema.get("type");
        if (type != null && type.isTextual() && !matchesType(value, type.textValue())) {
            throw new SchemaViolation(location + " must be " + type.textValue());
        }
    }

    private static void validateRequired(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode required = schema.get("required");
        if (required == null || !required.isArray() || !value.isObject()) {
            return;
        }
        for (JsonNode field : required) {
            if (!value.has(field.textValue())) {
                throw new SchemaViolation(location + " is missing required field '" + field.textValue() + "'");
            }
        }
    }

    private static void validateProperties(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode properties = schema.get("properties");
        if (properties == null || !properties.isObject() || !value.isObject()) {
            return;
        }
        if (!schema.path("additionalProperties").asBoolean(true)) {
            rejectUnknownFields(value, properties, location);
        }
        for (Map.Entry<String, JsonNode> field : properties.properties()) {
            if (value.has(field.getKey())) {
                validateNode(value.get(field.getKey()), field.getValue(), location + "." + field.getKey());
            }
        }
    }

    private static void rejectUnknownFields(
        final JsonNode value,
        final JsonNode properties,
        final String location
    ) throws SchemaViolation {
        for (String fieldName : value.propertyNames()) {
            if (!properties.has(fieldName)) {
                throw new SchemaViolation(location + " has unknown field '" + fieldName + "'");
            }
        }
    }

    private static void validateItems(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode items = schema.get("items");
        if (items == null || !value.isArray()) {
            return;
        }
        for (int index = 0; index < value.size(); index++) {
            validateNode(value.get(index), items, location + "[" + index + "]");
        }
    }

    private static void validateMinLength(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode minLength = schema.get("minLength");
        if (minLength != null && value.isTextual() && value.textValue().length() < minLength.intValue()) {
            throw new SchemaViolation(location + " is shorter than " + minLength.intValue());
        }
    }

    private static void validateUniqueItems(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        if (!schema.path("uniqueItems").asBoolean(false) || !value.isArray()) {
            return;
        }
        final Set<String> distinct = new HashSet<>();
        for (JsonNode item : value) {
            if (!distinct.add(item.toString())) {
                throw new SchemaViolation(location + " must contain unique items");
            }
        }
    }

    private static void validateEnum(
        final JsonNode value,
        final JsonNode schema,
        final String location
    ) throws SchemaViolation {
        final JsonNode enumValues = schema.get("enum");
        if (enumValues == null || !enumValues.isArray()) {
            return;
        }
        for (JsonNode enumValue : enumValues) {
            if (enumValue.equals(value)) {
                return;
            }
        }
        throw new SchemaViolation(location + " has a value outside the schema enum");
    }

    private static boolean matchesType(final JsonNode value, final String type) {
        return switch (type) {
            case "object" -> value.isObject();
            case "array" -> value.isArray();
            case "string" -> value.isTextual();
            case "boolean" -> value.isBoolean();
            default -> false;
        };
    }

    private static final class SchemaViolation extends Exception {

        SchemaViolation(final String message) {
            super(message);
        }
    }
}
