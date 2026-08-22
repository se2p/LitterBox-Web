/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.single_project;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.stereotype.Component;

import de.uni_passau.fim.se2.litterbox_web.shared.SandboxedSvg;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ProjectArchiveInspector {

    private static final long MAX_COMPRESSED_BYTES = 100L * 1024 * 1024;
    private static final int MAX_ENTRIES = 2_000;
    private static final long MAX_UNCOMPRESSED_BYTES = 100L * 1024 * 1024;
    private static final long MAX_ENTRY_BYTES = 25L * 1024 * 1024;
    private static final int MAX_NESTING_DEPTH = 2;
    private static final int MAX_NAME_LENGTH = 255;
    private static final int BUFFER_SIZE = 16 * 1024;

    private final JsonMapper mapper = JsonMapper.shared();

    public Inspection inspect(final byte[] archive) throws IOException {
        if (archive == null || archive.length == 0) {
            throw new IllegalArgumentException("Project archive must not be empty");
        }
        if (archive.length > MAX_COMPRESSED_BYTES) {
            throw new IllegalArgumentException("Project archive is too large before extraction");
        }
        final Map<String, byte[]> entries = readEntries(archive);
        final byte[] project = entries.get("project.json");
        if (project == null) {
            throw new IllegalArgumentException("Project archive must contain one root project.json");
        }

        final JsonNode root = mapper.readTree(project);
        validateProject(root);
        final JsonNode targets = root.get("targets");

        final List<ArchiveAsset> assets = new ArrayList<>();
        final Map<String, String> thumbnailHashes = new LinkedHashMap<>();
        for (JsonNode target : targets) {
            final ArchiveAsset asset = addCurrentCostume(target, entries, assets);
            final String targetName = target.path("name").textValue();
            if (asset != null && targetName != null && !targetName.isBlank()) {
                thumbnailHashes.putIfAbsent(targetName, HexFormat.of().formatHex(asset.sha256()));
            }
        }
        validateManifest(entries, project);
        return new Inspection(project, assets, thumbnailHashes);
    }

    private Map<String, byte[]> readEntries(final byte[] archive) throws IOException {
        final Map<String, byte[]> entries = new HashMap<>();
        final Set<String> normalizedNames = new HashSet<>();
        int count = 0;
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES) {
                    throw new IllegalArgumentException("Project archive contains too many entries");
                }
                validateEntryName(entry.getName());
                final String normalizedName = entry.getName().toLowerCase(Locale.ROOT);
                if (!normalizedNames.add(normalizedName)) {
                    throw new IllegalArgumentException("Project archive contains duplicate entries");
                }
                if (entry.isDirectory()) {
                    continue;
                }
                if (entry.getCompressedSize() > MAX_COMPRESSED_BYTES) {
                    throw new IllegalArgumentException("Project archive entry is too large before extraction");
                }
                final ByteArrayOutputStream output = new ByteArrayOutputStream();
                final byte[] buffer = new byte[BUFFER_SIZE];
                int read;
                long entrySize = 0;
                while ((read = zip.read(buffer)) >= 0) {
                    entrySize += read;
                    total += read;
                    if (entrySize > MAX_ENTRY_BYTES || total > MAX_UNCOMPRESSED_BYTES) {
                        throw new IllegalArgumentException("Project archive is too large after extraction");
                    }
                    output.write(buffer, 0, read);
                }
                if (entries.putIfAbsent(entry.getName(), output.toByteArray()) != null) {
                    throw new IllegalArgumentException("Project archive contains duplicate entries");
                }
            }
        }
        return entries;
    }

    private void validateEntryName(final String name) {
        validateBasicEntryName(name);
        final String[] components = name.split("/", -1);
        validateEntryComponents(components);
        validateNestedArchive(name);
    }

    private void validateBasicEntryName(final String name) {
        if (name == null || name.isBlank() || name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Project archive contains an unsafe entry");
        }
        if (name.startsWith("/") || name.startsWith("\\") || name.contains("\\")) {
            throw new IllegalArgumentException("Project archive contains an unsafe entry");
        }
    }

    private void validateEntryComponents(final String[] components) {
        if (components.length > MAX_NESTING_DEPTH + 1) {
            throw new IllegalArgumentException("Project archive is nested too deeply");
        }
        for (String component : components) {
            if (component.isBlank() || ".".equals(component) || "..".equals(component)) {
                throw new IllegalArgumentException("Project archive contains an unsafe entry");
            }
        }
    }

    private void validateNestedArchive(final String name) {
        final String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".zip") || lower.endsWith(".sb3") || lower.endsWith(".mblock")) {
            throw new IllegalArgumentException("Project archive contains a nested archive");
        }
    }

    private void validateProject(final JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("project.json must contain an object");
        }
        final JsonNode targets = root.get("targets");
        if (targets == null || !targets.isArray()) {
            throw new IllegalArgumentException("project.json does not contain a targets array");
        }
        if (targets.size() > MAX_ENTRIES) {
            throw new IllegalArgumentException("Scratch project contains too many targets");
        }
        targets.forEach(this::validateTarget);
    }

    private void validateTarget(final JsonNode target) {
        if (target == null || !target.isObject()) {
            throw new IllegalArgumentException("Scratch project contains an invalid target");
        }
        final JsonNode blocks = target.get("blocks");
        if (blocks != null) {
            validateBlocks(blocks);
        }
    }

    private void validateBlocks(final JsonNode blocks) {
        if (!blocks.isObject()) {
            throw new IllegalArgumentException("Scratch target blocks must be an object");
        }
        if (blocks.size() > MAX_ENTRIES * 100) {
            throw new IllegalArgumentException("Scratch target contains too many blocks");
        }
        for (Map.Entry<String, JsonNode> block : blocks.properties()) {
            if (!validBlock(block)) {
                throw new IllegalArgumentException("Scratch target contains an invalid block");
            }
            final JsonNode type = block.getValue().get("opcode");
            if (type != null && (!type.isTextual() || type.textValue().isBlank())) {
                throw new IllegalArgumentException("Scratch target contains a block without an opcode");
            }
        }
    }

    private static boolean validBlock(final Map.Entry<String, JsonNode> block) {
        if (block.getKey().isBlank() || block.getKey().length() > MAX_NAME_LENGTH) {
            return false;
        }
        return block.getValue() != null && block.getValue().isObject();
    }

    private void validateManifest(final Map<String, byte[]> entries, final byte[] project) throws IOException {
        final byte[] manifest = entries.get("litterbox/manifest.json");
        if (manifest == null) {
            return;
        }
        final JsonNode root = mapper.readTree(manifest);
        if (!validManifest(root, project)) {
            throw new IllegalArgumentException("Scratch source manifest is invalid");
        }
        final byte[] metadata = entries.get("litterbox/metadata.json");
        if (!validMetadata(metadata, root)) {
            throw new IllegalArgumentException("Scratch source metadata is missing");
        }
        for (JsonNode asset : root.path("assets")) {
            final String name = asset.path("name").textValue();
            final String sha256 = asset.path("sha256").textValue();
            final byte[] content = name == null ? null : entries.get(name);
            if (!validManifestAsset(content, sha256)) {
                throw new IllegalArgumentException("Scratch source manifest does not match its assets");
            }
        }
    }

    private boolean validManifest(final JsonNode root, final byte[] project) {
        if (root == null || !root.isObject()) {
            return false;
        }
        if (!"scratch-project-bundle".equals(root.path("format").textValue()) || root.path("version").asInt(-1) < 2) {
            return false;
        }
        if (root.path("projectId").textValue() == null || root.path("fetchedAt").textValue() == null) {
            return false;
        }
        final String expected = root.path("projectJsonSha256").textValue();
        if (expected == null) {
            return false;
        }
        if (!HexFormat.of().formatHex(SingleProjectSupport.digest("SHA-256", project)).equalsIgnoreCase(expected)) {
            return false;
        }
        return root.path("assets").isArray();
    }

    private boolean validMetadata(final byte[] metadata, final JsonNode root) throws IOException {
        if (metadata == null || !mapper.readTree(metadata).isObject()) {
            return false;
        }
        final String expected = root.path("metadataSha256").textValue();
        return expected != null
            && HexFormat.of().formatHex(SingleProjectSupport.digest("SHA-256", metadata)).equalsIgnoreCase(expected);
    }

    private boolean validManifestAsset(final byte[] content, final String sha256) {
        if (content == null || sha256 == null) {
            return false;
        }
        return HexFormat.of().formatHex(SingleProjectSupport.digest("SHA-256", content)).equalsIgnoreCase(sha256);
    }

    private ArchiveAsset addCurrentCostume(
        final JsonNode target,
        final Map<String, byte[]> entries,
        final List<ArchiveAsset> assets
    ) {
        final JsonNode costumes = target.get("costumes");
        if (costumes == null || !costumes.isArray() || costumes.isEmpty()) {
            return null;
        }
        final JsonNode current = target.get("currentCostume");
        final int index = current == null ? 0 : current.asInt(-1);
        if (index < 0 || index >= costumes.size()) {
            throw new IllegalArgumentException("Scratch target refers to an invalid current costume");
        }
        return addCurrentCostumeAsset(costumes.get(index), entries, assets);
    }

    private ArchiveAsset addCurrentCostumeAsset(
        final JsonNode costume,
        final Map<String, byte[]> entries,
        final List<ArchiveAsset> assets
    ) {
        final String md5ext = costumeIdentifier(costume);
        final String extension = md5ext.substring(md5ext.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        final byte[] content = entries.get(md5ext);
        if (content == null) {
            return null;
        }
        validateCostumeDigest(md5ext, content);
        final String mediaType = "svg".equals(extension) ? vectorMediaType(content) : mediaType(content);
        if (mediaType == null) {
            return null;
        }
        final byte[] sha256 = SingleProjectSupport.digest("SHA-256", content);
        final ArchiveAsset existing = findAsset(assets, sha256);
        if (existing != null) {
            return existing;
        }
        final ArchiveAsset asset = newArchiveAsset(md5ext, extension, mediaType, content, sha256);
        assets.add(asset);
        return asset;
    }

    private ArchiveAsset findAsset(final List<ArchiveAsset> assets, final byte[] sha256) {
        return assets.stream()
            .filter(asset -> MessageDigest.isEqual(asset.sha256(), sha256))
            .findFirst()
            .orElse(null);
    }

    private ArchiveAsset newArchiveAsset(
        final String md5ext,
        final String extension,
        final String mediaType,
        final byte[] content,
        final byte[] sha256
    ) {
        return new ArchiveAsset(sha256, md5ext.substring(0, 32), extension, mediaType, content);
    }

    private String costumeIdentifier(final JsonNode costume) {
        final JsonNode md5Node = costume.get("md5ext");
        if (md5Node == null || !md5Node.isTextual()) {
            throw new IllegalArgumentException("Current costume has no Scratch asset identifier");
        }
        final String md5ext = md5Node.asString();
        final int separator = md5ext.lastIndexOf('.');
        if (separator != 32) {
            throw new IllegalArgumentException("Current costume has an invalid Scratch asset identifier");
        }
        if (!md5ext.substring(0, separator).matches("[0-9a-fA-F]{32}")) {
            throw new IllegalArgumentException("Current costume has an invalid Scratch asset identifier");
        }
        if (!md5ext.substring(separator + 1).matches("[A-Za-z0-9]{1,10}")) {
            throw new IllegalArgumentException("Current costume has an invalid Scratch asset identifier");
        }
        return md5ext;
    }

    private void validateCostumeDigest(final String md5ext, final byte[] content) {
        final String actual = HexFormat.of().formatHex(SingleProjectSupport.digest("MD5", content));
        if (!actual.equalsIgnoreCase(md5ext.substring(0, 32))) {
            throw new IllegalArgumentException("Current costume asset does not match its Scratch MD5");
        }
    }

    private String mediaType(final byte[] content) {
        if (startsWith(content, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return "image/png";
        }
        if (startsWith(content, 0xFF, 0xD8, 0xFF)) {
            return "image/jpeg";
        }
        if (
            startsWith(content, 'G', 'I', 'F', '8', '7', 'a')
                || startsWith(content, 'G', 'I', 'F', '8', '9', 'a')
        ) {
            return "image/gif";
        }
        if (startsWith(content, 'R', 'I', 'F', 'F') && startsWithAt(content, 8, 'W', 'E', 'B', 'P')) {
            return "image/webp";
        }
        throw new IllegalArgumentException("Current costume is not a supported raster image");
    }

    private static boolean startsWith(final byte[] content, final int... signature) {
        return startsWithAt(content, 0, signature);
    }

    private static boolean startsWithAt(final byte[] content, final int offset, final int... signature) {
        if (content.length < offset + signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if (content[offset + index] != (byte) signature[index]) {
                return false;
            }
        }
        return true;
    }

    /**
     * A vector the admission check turns away yields {@code null}, so the sprite falls back to its placeholder instead
     * of failing the whole analysis.
     */
    private String vectorMediaType(final byte[] content) {
        return SandboxedSvg.isPreviewable(content) ? SandboxedSvg.MEDIA_TYPE : null;
    }

    public record Inspection(
        byte[] projectJson,
        List<ArchiveAsset> assets,
        Map<String, String> thumbnailHashes
    ) {

        public Inspection {
            projectJson = projectJson.clone();
            assets = List.copyOf(assets);
            thumbnailHashes = Map.copyOf(thumbnailHashes);
        }

        public Inspection(final byte[] projectJson, final List<ArchiveAsset> assets) {
            this(projectJson, assets, Map.of());
        }

        @Override
        public byte[] projectJson() {
            return projectJson.clone();
        }
    }

    public record ArchiveAsset(
        byte[] sha256,
        String scratchMd5,
        String extension,
        String mediaType,
        byte[] content
    ) {

        public ArchiveAsset {
            sha256 = sha256.clone();
            content = content.clone();
        }

        @Override
        public byte[] sha256() {
            return sha256.clone();
        }

        @Override
        public byte[] content() {
            return content.clone();
        }
    }
}
