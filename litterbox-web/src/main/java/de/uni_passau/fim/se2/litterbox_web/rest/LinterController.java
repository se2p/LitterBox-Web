package de.uni_passau.fim.se2.litterbox_web.rest;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@RestController
@RequestMapping("/linter")
public class LinterController {

    @PostMapping("/upload")
    public ResponseEntity<String> handleFileUpload(@RequestParam("file") MultipartFile file) {
        try {
            // Get the original file name
            String originalFileName = file.getOriginalFilename();

            // Define the target directory where the file will be saved
            Path targetDirectory = Path.of("GUI_OUTPUT");

            // Create the target directory if it doesn't exist
            Files.createDirectories(targetDirectory);

            // Create the target file path
            Path targetFilePath = targetDirectory.resolve(originalFileName);

            // Save the uploaded file to the target directory
            Files.copy(file.getInputStream(), targetFilePath, StandardCopyOption.REPLACE_EXISTING);

            return ResponseEntity.ok("File uploaded successfully. Saved at: " + targetFilePath.toString());
        } catch (IOException e) {
            return ResponseEntity.status(500).body("Failed to process the uploaded file: " + e.getMessage());
        }
    }
}