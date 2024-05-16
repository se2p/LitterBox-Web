/*
 * Copyright (C) 2024 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.tutorial_system.code_analyzer.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import de.uni_passau.fim.se2.litterbox.analytics.BugAnalyzer;
import de.uni_passau.fim.se2.litterbox.utils.IssueTranslator;

/**
 * Used to analyze a SCRATCH program.
 */
@Service
public class ProgramAnalyzerService {

    private static final Logger log = LoggerFactory.getLogger(ProgramAnalyzerService.class);

    /**
     * Builds all required params to create a new instance of {@link BugAnalyzer}.
     *
     * @param inputFileContent The SCRATCH program to be checked in JSON format as String.
     * @return params as {@link AnalyserParams} record.
     */
    private static AnalyserParams getParams(String inputFileContent, String detectors) {
        boolean ignoreLooseBlocks = false;
        boolean delete = true;
        boolean outputPerScript = false;
        TempFiles files = createTempFiles(inputFileContent);
        return new AnalyserParams(files.input, files.output, detectors, ignoreLooseBlocks, delete, outputPerScript);
    }

    /**
     * Creates the required in- and output file to initialize {@link BugAnalyzer}. The endpoint gets the program to be
     * checked as JSON request, for this reason we create temp files to temporary save the input and output.
     *
     * @param fileContent Content of the input file. In our case the JSON representation of the SCRATCH program from the
     *                    request.
     * @return the temp file paths saved in a {@link TempFiles} record.
     */
    private static TempFiles createTempFiles(String fileContent) {
        Path input;
        Path output;
        try {
            input = Files.createTempFile("input", ".json");
            output = Files.createTempFile("output", ".json");
            Files.writeString(input, fileContent, StandardOpenOption.WRITE);
        }
        catch (IOException e) {
            log.error("Error occurred while creating temp files and writing into the input file.", e);
            throw new RuntimeException(e);
        }
        if (output != null) {
            return new TempFiles(input, output);
        }
        else {
            log.error("Failed to create output file for the BugAnalyser.");
            throw new RuntimeException("Failed to create output file for the BugAnalyser.");
        }
    }

    /**
     * Analyzes a SCRATCH program and returns the results.
     *
     * @param program   the program to be checked as String.
     * @param language  the language fot the output hints as Locale.
     * @param detectors String that contains all detectors
     * @return the results of analysis as String in the submitted language.
     */
    public String checkProgram(final String program, Locale language, String detectors) {
        AnalyserParams params = getParams(program, detectors);
        log.debug("Params for BugAnalyser: {}", params);
        if (language.toString().equals("english")) {
            log.info("IssueTranslator was set to {}", Locale.ENGLISH.toLanguageTag());
            IssueTranslator.getInstance().setLanguage(Locale.ENGLISH.toLanguageTag());
        }
        else {
            log.info("IssueTranslator was set to {}", "de");
            IssueTranslator.getInstance().setLanguage("de");
        }
        BugAnalyzer bugAnalyzer = new BugAnalyzer(
            params.outputFilePath, params.detector,
            params.ignoreLooseBlocks, params.delete, params.outputPerScript
        );
        try {
            bugAnalyzer.analyzeFile(params.inputFilePath);
        }
        catch (IOException e) {
            log.error("Error occurred while analyzing program.", e);
            throw new RuntimeException(e);
        }
        try {
            return Files.readString(params.outputFilePath);
        }
        catch (IOException e) {
            log.error("Error occurred while reading the analyser output from output file.", e);
            throw new RuntimeException(e);
        }
    }

    /**
     * Stores all required parameters to create a new {@link BugAnalyzer}.
     *
     * @param inputFilePath     Path of the input file.
     * @param outputFilePath    Path of output file.
     * @param detector          String that contains all detectors
     * @param ignoreLooseBlocks Boolean represents whether loose blocks should be ignored when checking bug patterns.
     * @param delete            Boolean that represents if project files should be deleted after analyzing.
     * @param outputPerScript   Boolean that represents whether output should be generated per file or for whole
     *                          program.
     */
    private record AnalyserParams(
        Path inputFilePath, Path outputFilePath, String detector, boolean ignoreLooseBlocks,
        boolean delete, boolean outputPerScript
    ) {

        /**
         * {@inheritDoc}
         */
        @Override
        public String toString() {
            List<String> params = getParams();
            return "(" + String.join(", ", params) + ")";
        }

        /**
         * Returns all attributes of {@link AnalyserParams} instance.
         *
         * @return all record attributes as List of Strings.
         */
        private List<String> getParams() {
            List<String> params = new ArrayList<>();
            params.add(inputFilePath.toString());
            params.add(outputFilePath.toString());
            params.add(detector);
            params.add(String.valueOf(ignoreLooseBlocks));
            params.add(String.valueOf(delete));
            params.add(String.valueOf(outputPerScript));
            return params;
        }
    }

    /**
     * Stores the in- and output-filepath of the temp files.
     *
     * @param input  Path of input file.
     * @param output Path of output file.
     */
    private record TempFiles(Path input, Path output) {
    }
}
