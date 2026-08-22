/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.catalogue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import de.uni_passau.fim.se2.litterbox.analytics.IssueTool;
import de.uni_passau.fim.se2.litterbox.analytics.IssueType;

class PatternCatalogueServiceTest {

    private static final Locale DUTCH = Locale.forLanguageTag("nl");

    /**
     * A worked example is the same picture in every language; only the label above it is translated, and the label
     * vocabulary is small and closed. Holding a translation against the English entry through this table therefore says
     * everything a hand-written list of expected labels per finder would say, for every finder rather than for the
     * handful anyone remembered to list.
     */
    private static final Map<String, Map<String, String>> EXAMPLE_LABELS = Map.ofEntries(
        Map.entry("Error", Map.of("de", "Fehler", "en", "Error", "es", "Error", "nl", "Fout")),
        Map.entry("Error 2", Map.of("de", "Fehler 2", "en", "Error 2", "es", "Error 2", "nl", "Fout 2")),
        Map.entry("Error 3", Map.of("de", "Fehler 3", "en", "Error 3", "es", "Error 3", "nl", "Fout 3")),
        Map.entry(
            "Possible solution",
            Map.of(
                "de", "Mögliche Lösung", "en", "Possible solution",
                "es", "Solución posible", "nl", "Mogelijke oplossing"
            )
        ),
        Map.entry(
            "Possible Solution",
            Map.of(
                "de", "Mögliche Lösung", "en", "Possible Solution",
                "es", "Solución posible", "nl", "Mogelijke oplossing"
            )
        ),
        Map.entry(
            "Possible Solution 2",
            Map.of(
                "de", "Mögliche Lösung 2", "en", "Possible Solution 2",
                "es", "Solución posible 2", "nl", "Mogelijke oplossing 2"
            )
        ),
        Map.entry(
            "Possible Solution 3",
            Map.of(
                "de", "Mögliche Lösung 3", "en", "Possible Solution 3",
                "es", "Solución posible 3", "nl", "Mogelijke oplossing 3"
            )
        ),
        Map.entry("Example", Map.of("de", "Beispiel", "en", "Example", "es", "Ejemplo", "nl", "Voorbeeld")),
        Map.entry(
            "Elegant code",
            Map.of("de", "Eleganter Code", "en", "Elegant code", "es", "Código bello", "nl", "Elegante code")
        ),
        Map.entry(
            "Elegant code 2",
            Map.of("de", "Eleganter Code 2", "en", "Elegant code 2", "es", "Código bello 2", "nl", "Elegante code 2")
        )
    );

    /**
     * Patterns whose instruction says something the hint does not. A translation that collapses the two silently drops
     * the advice, which no other check would notice, so the ones curated to differ are named here.
     */
    private static final Set<String> DISTINCT_INSTRUCTION_FINDERS = Set.of(
        "floating_point_comparison", "forever_inside_if", "hide_without_show", "invalid_actor_blocks",
        "invalid_number_string", "key_set_position", "message_as_literal", "missing_loop_mouse_position",
        "missing_wait_until_condition", "overwritten_visual_effect", "parameter_as_literal", "redundant_assignment",
        "ask_and_answer_perfume", "backdrop_switch", "custom_block_usage", "directed_motion", "gliding_motion",
        "matching_parameter", "object_follower", "responsive_loop_sensing", "say_sound_synchronisation", "timer",
        "used_variables", "waiting_check_stop",
        "ambient_light_in_bounds", "battery_level_in_bounds", "color_detection_in_bounds", "color_setting_in_bounds",
        "gear_potentiometer_in_bounds", "line_following_in_bounds", "loudness_in_bounds", "motor_power_in_bounds",
        "pitch_angle_in_bounds", "roll_angle_in_bounds", "shaking_strength_in_bounds", "ultra_sonic_in_bounds",
        "led_off_script", "loop_sensing_robot", "matrix_off_script", "motor_off_script", "parallelisation_robot",
        "rocky_light_off_script",
        "ambient_light_out_of_bounds", "battery_level_out_of_bounds", "color_detection_out_of_bounds",
        "color_setting_out_of_bounds", "gear_potentiometer_out_of_bounds", "line_following_out_of_bounds",
        "loudness_out_of_bounds", "motor_power_out_of_bounds", "pitch_angle_out_of_bounds", "roll_angle_out_of_bounds",
        "shaking_strength_out_of_bounds", "ultra_sonic_out_of_bounds",
        "codey_upload_stop_timed", "led_off_script_missing", "matrix_off_script_missing", "motor_low_power",
        "motor_stop_script_missing", "rocky_light_off_script_missing",
        "detect_repeat_in_loop", "interrupted_loop_sensing_robot", "looped_statement_not_stopped",
        "missing_loop_robot_sensing", "parallel_board_launch_script", "parallel_resource_use", "sensor_value_equals",
        "timed_statement_in_live_loop",
        "invalid_quantum_attribute", "invalid_quantum_entanglement_target", "invalid_quantum_possibilities_list",
        "missing_quantum_entanglement_event", "missing_quantum_entanglement_simple", "missing_quantum_measure_simple",
        "missing_quantum_superposition_event", "missing_quantum_superposition_simple",
        "delete_clone_in_loop", "duplicated_scripts_covering", "empty_parameter", "inappropriate_intimacy",
        "pointless_timer_reset", "unnecessary_boolean", "unnecessary_move", "unnecessary_rotation",
        "unnecessary_size_change", "unnecessary_stop_script", "unused_answer", "useless_wait",
        "invalid_quantum_possibilities", "multiple_quantum_measurements", "motor_power_minus",
        "multiple_attribute_modifications_robot", "unnecessary_time_robot"
    );

    /** Patterns curated as a faulty script beside its repair, which is what makes the entry worth opening. */
    private static final Set<String> CONTRASTED_EXAMPLE_FINDERS = Set.of(
        "floating_point_comparison", "forever_inside_if", "hide_without_show", "invalid_actor_blocks",
        "invalid_number_string", "key_set_position", "message_as_literal", "missing_loop_mouse_position",
        "missing_wait_until_condition", "overwritten_visual_effect", "parameter_as_literal", "redundant_assignment"
    );

    /**
     * Patterns a picture cannot help with, because what they describe is the absence of something rather than a shape
     * on the canvas. Everything else owes the reader at least one worked example.
     */
    private static final Set<String> PATTERNS_WITHOUT_WORKED_EXAMPLES = Set.of(
        "ambiguous_parameter_name_unused", "busy_waiting", "clone_type_1", "clone_type_3", "empty_project",
        "illegal_parameter_refactor", "missing_resource", "nested_loops", "same_variable_different_sprite",
        "sprite_naming", "unnecessary_if_after_until", "unnecessary_loop", "unnecessary_message",
        "unused_custom_block", "unused_parameter", "variable_initialization_race"
    );

    private PatternCatalogueService service;

    @BeforeEach
    void loadCheckedInCatalogue() {
        service = new PatternCatalogueService();
    }

    @Test
    void structuredEntriesMergeCuratedFieldsAndKeepDeterministicOrder() {
        final List<PatternCatalogueEntry> entries = service.entries(Locale.ENGLISH);
        final List<String> ids = entries.stream().map(PatternCatalogueEntry::finderId).toList();
        final List<String> sortedIds = ids.stream().sorted().toList();
        final PatternCatalogueEntry curated = service.entry("blocking_if_else", Locale.ENGLISH);

        assertEquals(sortedIds, ids);
        assertEquals("Blocking If-Else", curated.name());
        assertThat(curated.hint()).contains("[sbi]stop [all v][/sbi]");
        // The kind of finding comes from the finder itself, so it cannot disagree with what an analysis reports.
        assertEquals(IssueType.BUG, curated.issueType());
        assertTrue(!curated.fallback());
        // A faulty script beside a repaired one, which is what makes the entry worth opening.
        assertThat(curated.examples()).hasSize(2);
        assertThat(curated.examples().getFirst().scratchblocks()).contains("stop [this script v]");
    }

    @Test
    void curatedEntriesCarryRealContentRatherThanScaffolding() {
        final List<PatternCatalogueEntry> entries = service.entries(Locale.ENGLISH).stream()
            .filter(entry -> !entry.fallback())
            .toList();

        // Placeholder text shipped once before; nothing describing itself as synthetic may reach a reader again.
        assertTrue(entries.stream().noneMatch(entry -> entry.hint().toLowerCase(Locale.ROOT).contains("synthetic")));
        assertTrue(entries.stream().allMatch(entry -> entry.issueType() != null));
        assertThat(entries.size()).isGreaterThanOrEqualTo(80);
    }

    @Test
    void unsupportedLocaleUsesEnglishOverlayAfterNormalization() {
        final PatternCatalogueEntry entry = service.entry("comparing_literals", Locale.FRENCH);

        assertEquals("en", entry.locale());
        assertEquals("Comparing Literals", entry.name());
        assertFalse(entry.fallback());
    }

    @Test
    void fallbackCoverageIncludesEveryActiveFinderInEveryPublicLocale() {
        final Set<String> activeFinders = Set.copyOf(IssueTool.getAllFinderNames());

        for (String locale : PatternCatalogueLoader.SUPPORTED_LOCALES) {
            final List<PatternCatalogueEntry> entries = service.entries(Locale.of(locale));
            final Set<String> entryIds = entries.stream()
                .map(PatternCatalogueEntry::finderId)
                .collect(Collectors.toSet());

            assertThat(entryIds).containsExactlyInAnyOrderElementsOf(activeFinders);
            assertThat(entries).hasSize(activeFinders.size());
            assertTrue(entries.stream().allMatch(entry -> entry.issueType() != null));
        }
    }

    /**
     * The one test that has to hold for the whole catalogue rather than for whichever finders someone thought to list:
     * every active finder, in every locale the site offers, shows curated text and curated examples rather than the
     * analyser's own terse strings.
     */
    @Test
    void everyActiveFinderHasCuratedCoverageInEveryPublicLocale() {
        for (String finderId : IssueTool.getAllFinderNames()) {
            final PatternCatalogueEntry english = service.entry(finderId, Locale.ENGLISH);
            for (String locale : PatternCatalogueLoader.SUPPORTED_LOCALES) {
                assertCuratedEntry(service.entry(finderId, Locale.of(locale)), english, locale);
            }
        }
    }

    private static void assertCuratedEntry(
        final PatternCatalogueEntry entry,
        final PatternCatalogueEntry english,
        final String locale
    ) {
        final String finderId = entry.finderId();
        assertEquals(locale, entry.locale(), finderId);
        assertFalse(entry.fallback(), finderId);
        // The kind of finding comes from the finder itself, so the catalogue cannot contradict what a report says.
        assertEquals(IssueTool.getFinders(finderId).getFirst().issueType(), entry.issueType(), finderId);
        assertFalse(entry.name().isBlank(), finderId);
        assertFalse(entry.hint().isBlank(), finderId);
        assertFalse(entry.instruction().isBlank(), finderId);
        assertFalse((entry.name() + entry.hint() + entry.instruction()).contains("TODO"), finderId);
        if (DISTINCT_INSTRUCTION_FINDERS.contains(finderId)) {
            assertThat(entry.hint()).as(finderId).isNotEqualTo(entry.instruction());
        }

        if (PATTERNS_WITHOUT_WORKED_EXAMPLES.contains(finderId)) {
            assertThat(entry.examples()).as(finderId).isEmpty();
        }
        else {
            assertThat(entry.examples()).as(finderId).isNotEmpty();
        }
        assertEquals(english.examples().size(), entry.examples().size(), finderId);
        if (CONTRASTED_EXAMPLE_FINDERS.contains(finderId)) {
            assertThat(entry.examples()).as(finderId).hasSize(2);
            assertNotEquals(
                entry.examples().get(0).scratchblocks(), entry.examples().get(1).scratchblocks(), finderId
            );
        }
        assertCuratedExamples(entry, english, locale);
    }

    private static void assertCuratedExamples(
        final PatternCatalogueEntry entry,
        final PatternCatalogueEntry english,
        final String locale
    ) {
        final String finderId = entry.finderId();
        for (int index = 0; index < entry.examples().size(); index++) {
            final PatternCatalogueEntry.WorkedExample example = entry.examples().get(index);
            final String englishLabel = english.examples().get(index).label();
            final Map<String, String> translations = EXAMPLE_LABELS.get(englishLabel);
            assertNotNull(translations, finderId + " uses an unknown example label '" + englishLabel + "'");
            assertEquals(translations.get(locale), example.label(), finderId);

            // Only the label is translated: the picture itself has to stay the picture the English entry shows, or a
            // reader comparing two languages would be looking at two different programs.
            assertEquals(english.examples().get(index).scratchblocks(), example.scratchblocks(), finderId);
            assertFalse(example.scratchblocks().isBlank(), finderId);
            // Scaffolding from the exporter that means nothing to a reader.
            assertFalse(example.scratchblocks().contains("//Script:"), finderId);
            assertFalse(example.scratchblocks().contains("//Sprite:"), finderId);
            assertFalse(example.scratchblocks().replace("\r\n", "\n").contains("then\nend"), finderId);
        }
    }

    /**
     * {@code [newLine]} is a marker the core resource bundles use and a reader never should see. Dutch has been curated
     * clean of it throughout, so any reappearance is a translation that was copied rather than written.
     */
    @Test
    void dutchOverlaysCarryNoCoreResourcePlaceholders() {
        for (String finderId : IssueTool.getAllFinderNames()) {
            final PatternCatalogueEntry entry = service.entry(finderId, DUTCH);
            assertThat(entry.name() + entry.hint() + entry.instruction()).as(finderId).doesNotContain("[newLine]");
        }
    }

    @Test
    void communicationOverlaysKeepTheirWorkedExampleSequence() {
        // Three errors against two repairs, which only reads correctly if the labels keep the order they were
        // curated in.
        assertThat(
            service.entry("middle_man", DUTCH).examples().stream()
                .map(PatternCatalogueEntry.WorkedExample::label).toList()
        )
            .containsExactly("Fout", "Mogelijke oplossing", "Fout 2", "Fout 3", "Mogelijke oplossing 3");
        assertThat(
            service.entry("middle_man", Locale.of("es")).examples().stream()
                .map(PatternCatalogueEntry.WorkedExample::label).toList()
        )
            .containsExactly("Error", "Solución posible", "Error 2", "Error 3", "Solución posible 3");

        for (String finderId : List.of("message_never_received", "message_never_sent", "middle_man")) {
            final PatternCatalogueEntry entry = service.entry(finderId, Locale.of("es"));
            assertThat(entry.name() + entry.hint() + entry.instruction()).as(finderId).doesNotContain("[newLine]");
        }
    }

    @Test
    void dutchBugAndSmellOverlaysExplainTheDefectInDutchTerms() {
        // Advice about the pen reads backwards if the two blocks are named the wrong way round.
        final String missingPenDown = service.entry("missing_pen_down", DUTCH).hint();
        final String missingPenUp = service.entry("missing_pen_up", DUTCH).hint();
        assertThat(missingPenDown).contains("pen op", "pen neer");
        assertThat(missingPenDown.indexOf("pen op")).isLessThan(missingPenDown.indexOf("pen neer"));
        assertThat(missingPenUp).contains("pen neer", "pen op");
        assertThat(missingPenUp.indexOf("pen neer")).isLessThan(missingPenUp.indexOf("pen op"));

        assertThat(service.entry("unnecessary_loop", DUTCH).hint()).contains("repeat (1)", "repeat (0)");
        assertThat(service.entry("no_working_scripts", DUTCH).hint().toLowerCase(Locale.ROOT))
            .contains("losse blokken", "gebeurtenisblok");
        assertThat(service.entry("empty_script", DUTCH).hint()).contains("gebeurtenisblok", "niets");
        assertThat(service.entry("variable_initialization_race", DUTCH).hint())
            .contains("meerdere scripts", "uitvoeringsvolgorde");
        assertThat(dutchProse("comparing_literals"))
            .contains("altijd", "nooit", "voorwaarde", "wacht tot", "variabele");
        assertThat(dutchProse("immediate_stop_after_say_think")).contains("zichtbaar", "getimed");
        assertThat(service.entry("type_error", DUTCH).hint().toLowerCase(Locale.ROOT))
            .contains("vergelijkingen", "getypeerde", "doelwit");
        assertThat(service.entry("unnecessary_time", DUTCH).hint().toLowerCase(Locale.ROOT))
            .contains("duur nul", "tijdsblok", "wachten");
        assertThat(service.entry("variable_as_literal", DUTCH).hint().toLowerCase(Locale.ROOT))
            .contains("tekens", "waarde");
    }

    @Test
    void dutchPerfumeOverlaysExplainWhatMakesTheCodeGood() {
        assertThat(service.entry("loop_sensing", DUTCH).hint()).contains("herhaaldelijk", "Kortdurende invoer");
        assertThat(dutchProse("movement_in_loop")).contains("vloeiende", "lus", "herhaalde", "invoer");
        assertThat(service.entry("nested_conditional_checks", DUTCH).hint())
            .contains("afhankelijke beslissingen", "binnenste voorwaarde");
        assertThat(service.entry("nested_loops_perfume", DUTCH).hint())
            .contains("meerdere niveaus", "duidelijk doel");
        assertThat(service.entry("parallelisation", DUTCH).hint().toLowerCase(Locale.ROOT))
            .contains("zelfde gebeurtenis", "gelijktijdig", "volgorde");
        assertThat(dutchProse("useful_position_check")).contains("gelijkheidscontrole", "decimale", "drempel");
        assertThat(service.entry("valid_termination", DUTCH).hint())
            .contains("betekenisvolle voorwaarde", "eindtoestand");
    }

    private String dutchProse(final String finderId) {
        final PatternCatalogueEntry entry = service.entry(finderId, DUTCH);
        return entry.hint().toLowerCase(Locale.ROOT) + " " + entry.instruction().toLowerCase(Locale.ROOT);
    }

    @Test
    void quantumExamplesShowTheQuantumBlockTheyAreAbout() {
        assertThat(scratchblocks("invalid_quantum_attribute"))
            .contains("superpose [position v]");
        assertThat(scratchblocks("invalid_quantum_entanglement_target")).contains("with [non-existing]");
        assertThat(scratchblocks("invalid_quantum_possibilities_list")).contains("list: (6)");
        assertThat(scratchblocks("missing_quantum_entanglement_event")).contains("entangle [costume v]");
        assertThat(scratchblocks("missing_quantum_entanglement_simple"))
            .contains("when entanglement started :: events hat #5c068c")
            .doesNotContain("when superposition started");
        assertThat(scratchblocks("missing_quantum_measure_simple")).contains("when measured :: events hat #5c068c");
        assertThat(scratchblocks("missing_quantum_superposition_event")).contains("superpose [position v]");
        assertThat(scratchblocks("missing_quantum_superposition_simple"))
            .contains("when superposition started :: events hat #5c068c")
            .doesNotContain("when entanglement started");
        assertThat(scratchblocks("invalid_quantum_possibilities"))
            .contains("superpose [position v] possibilities: (0)")
            .contains("when superposition started :: events hat #5c068c");
        assertThat(scratchblocks("multiple_quantum_measurements"))
            .contains("superpose [position v] possibilities: (30)")
            .contains("when superposition started :: events hat #5c068c");
        assertEquals(2, scratchblocks("multiple_quantum_measurements").split("measure :: #5c068c", -1).length - 1);

        // The quantum palette colour is what tells a reader these are not ordinary Scratch blocks.
        for (String finderId : IssueTool.getAllFinderNames()) {
            if (finderId.contains("quantum")) {
                assertThat(scratchblocks(finderId)).as(finderId).contains("#5c068c");
            }
        }
    }

    @Test
    void scratchSmellExamplesShowTheSmellTheyAreAbout() {
        assertThat(scratchblocks("delete_clone_in_loop"))
            .contains("when I start as a clone", "forever", "delete this clone");
        final String duplicated = scratchblocks("duplicated_scripts_covering");
        assertEquals(2, duplicated.split("when green flag clicked", -1).length - 1);
        assertThat(duplicated).contains("\n\n").contains("repeat (10)");
        assertThat(scratchblocks("empty_parameter")).contains("move () steps");
        assertThat(scratchblocks("inappropriate_intimacy")).contains("Sprite2", "x position", "y position");
        assertThat(scratchblocks("pointless_timer_reset")).contains("reset timer").doesNotContain("(timer)");
        assertThat(scratchblocks("unnecessary_boolean")).contains("= [true]");
        assertThat(scratchblocks("unnecessary_move")).contains("move (0) steps");
        assertThat(scratchblocks("unnecessary_rotation")).contains("turn right (360) degrees");
        assertThat(scratchblocks("unnecessary_size_change")).contains("change size by (0)");
        assertThat(scratchblocks("unnecessary_stop_script")).endsWith("stop [this script v]");
        assertThat(scratchblocks("unused_answer"))
            .contains("ask [What is your name?] and wait")
            .doesNotContain("(answer)");
        assertThat(scratchblocks("useless_wait")).contains("move (10) steps", "wait (1) seconds");
    }

    @Test
    void robotExamplesShowTheRobotDefectTheyAreAbout() {
        assertThat(scratchblocks("motor_power_minus"))
            .contains("@codeyA move forward at power (-100) % for (1) secs :: motion");
        assertEquals(
            2, scratchblocks("multiple_attribute_modifications_robot").split("RGB LED lights up", -1).length - 1
        );
        assertThat(scratchblocks("unnecessary_time_robot"))
            .contains("@codeyA move forward at power (50) % for (0) secs :: motion")
            .doesNotContain("forever");
        // Two scripts side by side is the whole point of a concurrency example, so the blank line between them matters.
        assertThat(scratchblocks("parallel_board_launch_script")).contains("when Codey starts up").contains("\n\n");
        assertThat(scratchblocks("parallel_resource_use")).contains("when on-board button").contains("\n\n");
        assertThat(scratchblocks("timed_statement_in_live_loop")).contains("forever").contains("for (1) secs");
    }

    private String scratchblocks(final String finderId) {
        return service.entry(finderId, Locale.ENGLISH).examples().getFirst().scratchblocks();
    }

    @Test
    void matrixAndRockyNamesRemainDistinctInEveryLocale() {
        for (String locale : PatternCatalogueLoader.SUPPORTED_LOCALES) {
            assertNotEquals(
                service.entry("matrix_off_script", Locale.of(locale)).name(),
                service.entry("rocky_light_off_script", Locale.of(locale)).name()
            );
        }
    }

    @Test
    void matrixAndRockyMissingNamesRemainDistinctInEveryLocale() {
        for (String locale : PatternCatalogueLoader.SUPPORTED_LOCALES) {
            assertNotEquals(
                service.entry("matrix_off_script_missing", Locale.of(locale)).name(),
                service.entry("rocky_light_off_script_missing", Locale.of(locale)).name()
            );
        }
    }

    /**
     * Conformance to {@code catalogue.schema.json} is asserted once, over the checked-in resources, by
     * {@link CatalogueResourcesMatchTheirSchemaTest}. What the loader itself owes a caller is a legible failure for a
     * document it cannot read, which is what these three tests are about.
     */
    @Test
    void overlayWithoutALocaleIsRejected(@TempDir final Path tempDirectory) throws IOException {
        write(tempDirectory, "i18n", "no-locale.json", "{\"finderId\":\"blocking_if_else\"}");

        final IllegalStateException exception = assertThrows(
            IllegalStateException.class, () -> serviceFor(tempDirectory)
        );

        assertThat(exception).hasMessageContaining("field 'locale' must be a non-blank string");
    }

    /**
     * Which finders exist is the analyser's to say. An overlay naming one it does not know is text nobody will ever be
     * shown, and the mistake is far likelier to be a typo in the id than a finder that has genuinely gone.
     */
    @Test
    void overlaysForUnknownFindersAreRejected(@TempDir final Path tempDirectory) throws IOException {
        writeOverlay(tempDirectory, "unknown-finder.json", "not_a_core_finder", "en");

        final IllegalStateException exception = assertThrows(
            IllegalStateException.class, () -> serviceFor(tempDirectory)
        );

        assertThat(exception).hasMessageContaining("unknown finder reference 'not_a_core_finder'");
    }

    @Test
    void twoOverlaysForTheSameFinderAndLocaleAreRejected(@TempDir final Path tempDirectory) throws IOException {
        writeOverlay(tempDirectory, "first.json", "blocking_if_else", "en");
        writeOverlay(tempDirectory, "second.json", "blocking_if_else", "en");

        final IllegalStateException exception = assertThrows(
            IllegalStateException.class, () -> serviceFor(tempDirectory)
        );

        assertThat(exception).hasMessageContaining("duplicate locale 'en' for finder 'blocking_if_else'");
    }

    /**
     * An overlay says nothing but what a finder is called and how to explain it in one language. What kind of finding
     * it reports comes from the finder itself, so the catalogue cannot contradict what an analysis reports.
     */
    @Test
    void overlayTextStandsAgainstTheCoreFinder(@TempDir final Path tempDirectory) throws IOException {
        writeOverlay(tempDirectory, "orphan-overlay.json", "blocking_if_else", "en");

        final PatternCatalogueEntry entry = serviceFor(tempDirectory).entry("blocking_if_else", Locale.ENGLISH);

        assertThat(entry.name()).isEqualTo("Synthetic overlay");
        assertEquals(IssueType.BUG, entry.issueType());
    }

    @Test
    void partialOverlayFieldsFallBackPredictably(@TempDir final Path tempDirectory) throws IOException {
        write(tempDirectory, "i18n", "blocking-en.json", """
            {
              "finderId": "blocking_if_else",
              "locale": "en",
              "name": "Curated name",
              "hint": "Curated hint"
            }
            """);

        final PatternCatalogueEntry entry = serviceFor(tempDirectory).entry("blocking_if_else", Locale.ENGLISH);

        assertEquals("Curated name", entry.name());
        assertEquals("Curated hint", entry.hint());
        assertEquals("Curated hint", entry.instruction());
        assertThat(entry.examples()).isEmpty();
        // An overlay that leaves fields out is still an overlay the reader is not seeing in full.
        assertTrue(entry.fallback());
    }

    @Test
    void examplesPreserveDeclaredOrder(@TempDir final Path tempDirectory) throws IOException {
        write(tempDirectory, "i18n", "blocking-en.json", """
            {
              "finderId": "blocking_if_else",
              "locale": "en",
              "name": "Name",
              "hint": "Hint",
              "instruction": "Instruction",
              "examples": [
                {"label": "Zed", "scratchblocks": "z"},
                {"label": "Alpha", "scratchblocks": "a"},
                {"label": "Alpha", "scratchblocks": "b"}
              ]
            }
            """);

        final List<PatternCatalogueEntry.WorkedExample> examples = serviceFor(tempDirectory)
            .entry("blocking_if_else", Locale.ENGLISH)
            .examples();

        assertEquals(
            List.of("Zed", "Alpha", "Alpha"), examples.stream()
                .map(PatternCatalogueEntry.WorkedExample::label)
                .toList()
        );
        assertEquals(
            List.of("z", "a", "b"), examples.stream()
                .map(PatternCatalogueEntry.WorkedExample::scratchblocks)
                .toList()
        );
    }

    @Test
    void deterministicIterationIsStableAcrossLoads(@TempDir final Path tempDirectory) throws IOException {
        writeOverlay(tempDirectory, "z-blocking.json", "blocking_if_else", "en");
        writeOverlay(tempDirectory, "a-comparing.json", "comparing_literals", "en");

        final List<PatternCatalogueEntry> first = serviceFor(tempDirectory).entries(Locale.ENGLISH);
        final List<PatternCatalogueEntry> second = serviceFor(tempDirectory).entries(Locale.ENGLISH);

        assertEquals(first, second);
        // The file names run the other way to the finder ids, so an entry order taken from the directory listing
        // rather than from the ids would show here.
        assertThat(first).filteredOn(entry -> entry.name().equals("Synthetic overlay"))
            .extracting(PatternCatalogueEntry::finderId)
            .containsExactly("blocking_if_else", "comparing_literals");
    }

    @Test
    void unknownEntryLookupRemainsAnError() {
        final IllegalArgumentException exception = assertThrows(
            IllegalArgumentException.class, () -> service.entry("unknown", Locale.ENGLISH)
        );

        assertThat(exception).hasMessageContaining("Unknown finder: unknown");
    }

    private static PatternCatalogueService serviceFor(final Path root) {
        return new PatternCatalogueService(new PathResourceSource(root));
    }

    private static void writeOverlay(
        final Path root,
        final String fileName,
        final String finderId,
        final String locale
    ) throws IOException {
        write(root, "i18n", fileName, """
            {
              "finderId": "%s",
              "locale": "%s",
              "name": "Synthetic overlay"
            }
            """.formatted(finderId, locale));
    }

    private static void write(
        final Path root,
        final String directory,
        final String fileName,
        final String content
    ) throws IOException {
        final Path targetDirectory = root.resolve(directory);
        Files.createDirectories(targetDirectory);
        Files.writeString(targetDirectory.resolve(fileName), content);
    }
}
