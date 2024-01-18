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

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@RestController
@RequestMapping("/linter")
public class LinterController {

    @PostMapping("/upload")
    public ResponseEntity<String> handleFileUpload(@RequestParam("file") MultipartFile file) {
        try {
            // Get the original file name
            String originalFileName = file.getOriginalFilename();

            // Check if the file has a .sb3 extension
            if (originalFileName != null && originalFileName.toLowerCase().endsWith(".sb3")) {
                // Rename .sb3 to .zip for extraction
                originalFileName = originalFileName.substring(0, originalFileName.length() - 4) + ".zip";
            }

            // Define the target directory where the file will be saved
            Path targetDirectory = Path.of("GUI_OUTPUT");

            // Create the target directory if it doesn't exist
            Files.createDirectories(targetDirectory);

            // Create the target file path
            Path targetFilePath = targetDirectory.resolve(originalFileName);

            // Save the uploaded file to the target directory
            Files.copy(file.getInputStream(), targetFilePath, StandardCopyOption.REPLACE_EXISTING);

            // Extract project.json from the zip file
            extractProjectJson(targetFilePath, targetDirectory);

            return ResponseEntity.ok("File uploaded successfully. Saved at: " + targetDirectory.toString());
        } catch (IOException e) {
            // Return plain text response in case of an error
            return ResponseEntity.status(500).body("Failed to process the uploaded file: " + e.getMessage());
        }
    }

    private void extractProjectJson(Path zipFilePath, Path targetDirectory) throws IOException {
        try (ZipInputStream zipInputStream = new ZipInputStream(new FileInputStream(zipFilePath.toFile()))) {
            ZipEntry entry;
            while ((entry = zipInputStream.getNextEntry()) != null) {
                if (entry.getName().equals("project.json")) {
                    // Save project.json to the target directory
                    Path projectJsonPath = targetDirectory.resolve("project.json");
                    Files.copy(zipInputStream, projectJsonPath, StandardCopyOption.REPLACE_EXISTING);
                    break;
                }
            }
        }
    }
}