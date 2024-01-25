/*
* Copyright (C) 2023 LitterBox-Web contributors
*
* This file is part of LitterBox-Web.
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
package de.uni_passau.fim.se2.litterbox_web.rest;


 import java.io.File;
// import java.io.FileInputStream;
// import java.io.IOException;
// import java.nio.file.Files;
// import java.nio.file.Path;
// import java.nio.file.Paths;
// import java.nio.file.StandardCopyOption;
// import java.util.Iterator;
// import java.util.Set;
// import java.util.zip.ZipEntry;
// import java.util.zip.ZipInputStream;
// import de.uni_passau.fim.se2.litterbox.analytics.BugAnalyzer;
// import de.uni_passau.fim.se2.litterbox.analytics.Issue;
// import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
// import de.uni_passau.fim.se2.litterbox.ast.model.Program;
// import de.uni_passau.fim.se2.litterbox.ast.model.metadata.MetaMetadata;
// import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
//
// @RestController
// @RequestMapping("/linter")
// public class LinterController {
// public static String convertToJson(Set<Issue> issues) {
// try {
// ObjectMapper objectMapper = new ObjectMapper();
// return objectMapper.writeValueAsString(issues);
// } catch (Exception e) {
// e.printStackTrace();
// return null;
// }
// }
//
// // private static final Logger log =
// // LoggerFactory.getLogger(DummyResource.class);
//
// private static final Scratch3Parser PARSER = new Scratch3Parser();
//
// // Class representing the JSON response structure
// private static class LinterResponse {
// private final String message;
// private final String error;
//
// public LinterResponse(String message, String error) {
// this.message = message;
// this.error = error;
// }
//
// public String getMessage() {
// return message;
// }
//
// public String getError() {
// return error;
// }
// }
//
// @PostMapping("/upload")
// public ResponseEntity<LinterResponse> handleFileUpload(@RequestParam("file")
// MultipartFile file) {
// try {
// // Get the original file name
// String originalFileName = file.getOriginalFilename();
//
// // Check if the file has a .sb3 extension
// if (originalFileName != null &&
// originalFileName.toLowerCase().endsWith(".sb3")) {
// // Rename .sb3 to .zip for extraction
// originalFileName = originalFileName.substring(0, originalFileName.length() -
// 4) + ".zip";
// }
//
// // Define the target directory where the file will be saved
// Path targetDirectory = Path.of("GUI_OUTPUT");
//
// // Create the target directory if it doesn't exist
// Files.createDirectories(targetDirectory);
//
// // Create the target file path
// Path targetFilePath = targetDirectory.resolve(originalFileName);
//
// // Save the uploaded file to the target directory
// Files.copy(file.getInputStream(), targetFilePath,
// StandardCopyOption.REPLACE_EXISTING);
//
// // Extract project.json from the zip file
// extractProjectJson(targetFilePath, targetDirectory);
//
// // Return JSON response for success
// return ResponseEntity.ok(
// new LinterResponse("File uploaded successfully. Saved at: " +
// targetDirectory.toString(), null));
// } catch (IOException e) {
// // Return JSON response in case of an error
// return ResponseEntity.status(500)
// .body(new LinterResponse(null, "Failed to process the uploaded file: " +
// e.getMessage()));
// }
// }
//
// private void extractProjectJson(Path zipFilePath, Path targetDirectory)
// throws IOException {
// try (ZipInputStream zipInputStream = new ZipInputStream(new
// FileInputStream(zipFilePath.toFile()))) {
// ZipEntry entry;
// while ((entry = zipInputStream.getNextEntry()) != null) {
// if (entry.getName().equals("project.json")) {
// // Save project.json to the target directory
// Path projectJsonPath = targetDirectory.resolve("project.json");
// Files.copy(zipInputStream, projectJsonPath,
// StandardCopyOption.REPLACE_EXISTING);
// break;


// @GetMapping("/bug")
// public ResponseEntity<String> getBugs() throws IOException, ParsingException
// {
// final Program program = PARSER.parseJsonFile(new
// File("litterbox-web/src/main/resources/sampleProject.json"));

// BugAnalyzer bugAnalyzer = new BugAnalyzer(
// Paths.get("litterbox-web/src/main/resources/sampleProject.json"),
// // path
// Paths.get("results.json"),
// "bugs",
// false, false, true);

// Set<Issue> issues = bugAnalyzer.check(program);
// String jsonIssues = convertToJson(issues);

// if (jsonIssues != null) {
// System.out.println(jsonIssues);
// return ResponseEntity.ok(jsonIssues);
// } else {
// return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
// .body("Error converting issues to JSON.");
// }
// }

// }

// // // @GetMapping("/bug")
// // // public void getBugs() throws ParsingException, IOException {
// // // final Program program = PARSER.parseJsonFile(new
// // File("litterbox-web/src/main/resources/sampleProject.json"));

// // // BugAnalyzer bugAnalyzer = new BugAnalyzer(
// // // Paths.get("litterbox-web/src/main/resources/sampleProject.json"),
// // // // path
// // // Paths.get("results.json"), // Replace with the appropriate output path,
// // // "",
// // // false, false, true);

// // // Set<Issue> issues = bugAnalyzer.check(program);

// // //
// //
// bugAnalyzer.writeResultToFile(Paths.get("litterbox-web/src/main/resources/sampleProject.json"),
// // program, issues);

// // // // Assuming that writeResultToFile writes to the specified output file
// // // return new File("results.json");

// // // }
