/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.capabilities.injection;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Scratch archive validation and reconstruction. */
final class InjectionArchiveCodec {

    private static final int MAX_ENTRY_NAME_LENGTH = 255;
    private static final String PRIVATE_PREFIX = "litterbox/";
    private static final String MANIFEST_NAME = "litterbox/manifest.json";
    private static final String METADATA_NAME = "litterbox/metadata.json";
    private static final JsonMapper MAPPER = JsonMapper.shared();

    private InjectionArchiveCodec() {
    }

    static ValidatedArchive inspect(final byte[] archive, final Limits limits) throws IOException {
        if (archive == null || archive.length == 0) {
            throw new ArchiveMalformed();
        }
        if (archive.length > limits.maxCompressedBytes()) {
            throw new ArchiveLimitExceeded();
        }
        final Map<String, byte[]> entries = readEntries(archive, limits);
        final byte[] projectJson = entries.get("project.json");
        if (projectJson == null) {
            throw new ArchiveMalformed();
        }
        final JsonNode project = readJson(projectJson);
        validateProjectShape(project, limits);
        validatePrivateBundle(entries, projectJson);
        validateReferencedAssets(project, entries);
        return new ValidatedArchive(projectJson, entries);
    }

    static byte[] reconstruct(
        final ValidatedArchive source,
        final byte[] derivedProjectJson,
        final Limits limits
    ) throws IOException {
        if (derivedProjectJson == null || derivedProjectJson.length > limits.maxEntryBytes()) {
            throw new ArchiveLimitExceeded();
        }
        final JsonNode derivedProject = readJson(derivedProjectJson);
        validateProjectShape(derivedProject, limits);
        validateReferencedAssets(derivedProject, source.entries());

        final Map<String, byte[]> outputEntries = new TreeMap<>();
        for (Map.Entry<String, byte[]> entry : source.entries().entrySet()) {
            if (!isPrivate(entry.getKey())) {
                outputEntries.put(entry.getKey(), entry.getValue());
            }
        }
        outputEntries.put("project.json", derivedProjectJson.clone());
        if (outputEntries.size() > limits.maxEntries()) {
            throw new ArchiveLimitExceeded();
        }
        long totalUncompressed = 0;
        for (byte[] content : outputEntries.values()) {
            if (totalUncompressed > limits.maxUncompressedBytes() - content.length) {
                throw new ArchiveLimitExceeded();
            }
            totalUncompressed += content.length;
        }

        final BoundedOutputStream bounded = new BoundedOutputStream(limits.maxCompressedBytes());
        try (ZipOutputStream zip = new ZipOutputStream(bounded, StandardCharsets.UTF_8)) {
            zip.setLevel(9);
            for (Map.Entry<String, byte[]> entry : outputEntries.entrySet()) {
                final ZipEntry zipEntry = new ZipEntry(entry.getKey());
                zipEntry.setTime(0L);
                zipEntry.setComment(null);
                zipEntry.setExtra(null);
                zip.putNextEntry(zipEntry);
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return bounded.toByteArray();
    }

    /**
     * Packs already-reconstructed derived projects into one archive. Each member is a complete project in its own
     * right; the wrapper only carries them, and is therefore stored rather than compressed, the members being
     * compressed already.
     */
    static byte[] bundle(final Map<String, byte[]> members, final Limits limits) throws IOException {
        if (members.isEmpty()) {
            throw new ArchiveMalformed();
        }
        if (members.size() > limits.maxEntries()) {
            throw new ArchiveLimitExceeded();
        }
        long total = 0;
        for (byte[] member : members.values()) {
            if (member == null || member.length == 0) {
                throw new ArchiveMalformed();
            }
            if (total > limits.maxUncompressedBytes() - member.length) {
                throw new ArchiveLimitExceeded();
            }
            total += member.length;
        }

        final BoundedOutputStream bounded = new BoundedOutputStream(limits.maxCompressedBytes());
        try (ZipOutputStream zip = new ZipOutputStream(bounded, StandardCharsets.UTF_8)) {
            zip.setMethod(ZipOutputStream.STORED);
            for (Map.Entry<String, byte[]> member : new TreeMap<>(members).entrySet()) {
                final ZipEntry entry = new ZipEntry(bundleMemberName(member.getKey()));
                entry.setTime(0L);
                entry.setComment(null);
                entry.setExtra(null);
                // A stored entry declares its own size and checksum up front rather than after the data.
                entry.setSize(member.getValue().length);
                entry.setCompressedSize(member.getValue().length);
                final java.util.zip.CRC32 checksum = new java.util.zip.CRC32();
                checksum.update(member.getValue());
                entry.setCrc(checksum.getValue());
                zip.putNextEntry(entry);
                zip.write(member.getValue());
                zip.closeEntry();
            }
        }
        return bounded.toByteArray();
    }

    /** Member names are built by the caller, never supplied by a reader, and are checked again here regardless. */
    private static String bundleMemberName(final String name) {
        if (name == null || name.isBlank() || name.length() > MAX_ENTRY_NAME_LENGTH) {
            throw new ArchiveMalformed();
        }
        if (!name.matches("[A-Za-z0-9._-]+") || name.startsWith(".")) {
            throw new ArchiveMalformed();
        }
        return name;
    }

    private static Map<String, byte[]> readEntries(final byte[] archive, final Limits limits) throws IOException {
        final Map<String, byte[]> entries = new LinkedHashMap<>();
        final Set<String> names = new TreeSet<>();
        long totalUncompressed = 0;
        int count = 0;
        try (InputStream input = new ByteArrayInputStream(archive); ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                count++;
                if (count > limits.maxEntries()) {
                    throw new ArchiveLimitExceeded();
                }
                final String name = entry.getName();
                validateEntryName(name);
                if (!names.add(name.toLowerCase(Locale.ROOT))) {
                    throw new ArchiveMalformed();
                }
                final long compressedSize = entry.getCompressedSize();
                if (compressedSize > limits.maxCompressedBytes()) {
                    throw new ArchiveLimitExceeded();
                }
                final long declaredSize = entry.getSize();
                if (declaredSize > limits.maxEntryBytes()) {
                    throw new ArchiveLimitExceeded();
                }

                final byte[] content = readEntry(zip, limits, totalUncompressed);
                totalUncompressed += content.length;
                if (totalUncompressed > limits.maxUncompressedBytes()) {
                    throw new ArchiveLimitExceeded();
                }
                if (declaredSize >= 0 && declaredSize != content.length) {
                    throw new ArchiveMalformed();
                }
                entries.put(name, content);
                zip.closeEntry();
            }
        }
        return Collections.unmodifiableMap(entries);
    }

    private static byte[] readEntry(
        final ZipInputStream zip,
        final Limits limits,
        final long totalUncompressed
    ) throws IOException {
        final BoundedOutputStream output = new BoundedOutputStream(limits.maxEntryBytes());
        final byte[] buffer = new byte[8192];
        long entrySize = 0;
        int read;
        while ((read = zip.read(buffer)) >= 0) {
            if (read == 0) {
                continue;
            }
            if (
                entrySize > limits.maxEntryBytes() - read
                    || totalUncompressed > limits.maxUncompressedBytes() - entrySize - read
            ) {
                throw new ArchiveLimitExceeded();
            }
            entrySize += read;
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static void validateEntryName(final String name) {
        validateEntryBasicName(name);
        final String[] components = name.split("/", -1);
        for (String component : components) {
            validateEntryComponent(component);
        }
    }

    private static void validateEntryBasicName(final String name) {
        if (name == null || name.isBlank() || name.length() > MAX_ENTRY_NAME_LENGTH) {
            throw new ArchiveMalformed();
        }
        if (name.startsWith("/") || name.startsWith("\\") || name.contains("\\")) {
            throw new ArchiveMalformed();
        }
        if (name.matches("^[A-Za-z]:.*")) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateEntryComponent(final String component) {
        if (component.isBlank() || ".".equals(component) || "..".equals(component)) {
            throw new ArchiveMalformed();
        }
        if (component.indexOf(':') >= 0) {
            throw new ArchiveMalformed();
        }
        final String lower = component.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".zip") || lower.endsWith(".sb3") || lower.endsWith(".mblock")) {
            throw new ArchiveMalformed();
        }
        for (int index = 0; index < component.length(); index++) {
            if (Character.isISOControl(component.charAt(index))) {
                throw new ArchiveMalformed();
            }
        }
    }

    private static JsonNode readJson(final byte[] content) throws IOException {
        try {
            final JsonNode root = MAPPER.readTree(content);
            if (root == null) {
                throw new ArchiveMalformed();
            }
            return root;
        }
        catch (ArchiveMalformed exception) {
            throw exception;
        }
        catch (RuntimeException | StackOverflowError exception) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateProjectShape(final JsonNode project, final Limits limits) {
        if (project == null || !project.isObject()) {
            throw new ArchiveMalformed();
        }
        final JsonNode targets = project.get("targets");
        if (targets == null || !targets.isArray() || targets.size() > limits.maxEntries()) {
            throw new ArchiveMalformed();
        }
        targets.forEach(InjectionArchiveCodec::validateTargetShape);
    }

    private static void validateTargetShape(final JsonNode target) {
        if (target == null || !target.isObject()) {
            throw new ArchiveMalformed();
        }
        final JsonNode blocks = target.get("blocks");
        if (blocks != null && !blocks.isObject()) {
            throw new ArchiveMalformed();
        }
        validateAssetList(target.get("costumes"));
        validateAssetList(target.get("sounds"));
    }

    private static void validateAssetList(final JsonNode assets) {
        if (assets != null && !assets.isArray()) {
            throw new ArchiveMalformed();
        }
        if (assets == null) {
            return;
        }
        for (JsonNode asset : assets) {
            if (asset == null || !asset.isObject()) {
                throw new ArchiveMalformed();
            }
            assetName(asset);
        }
    }

    private static void validateReferencedAssets(final JsonNode project, final Map<String, byte[]> entries) {
        collectReferencedAssets(project.get("targets"), entries);
    }

    /**
     * The one traversal of targets to costumes and sounds to asset names. Given the archive entries, every asset a
     * target names must be present under its own digest; given none, the names are gathered and nothing is required.
     */
    private static Set<String> collectReferencedAssets(final JsonNode targets, final Map<String, byte[]> entries) {
        final Set<String> referenced = new TreeSet<>();
        for (JsonNode target : targets) {
            addReferencedAssets(target.get("costumes"), referenced, entries);
            addReferencedAssets(target.get("sounds"), referenced, entries);
        }
        return referenced;
    }

    private static void addReferencedAssets(
        final JsonNode assets,
        final Set<String> referenced,
        final Map<String, byte[]> entries
    ) {
        if (assets == null) {
            return;
        }
        for (JsonNode asset : assets) {
            final String name = assetName(asset);
            if (!referenced.add(name) || entries == null) {
                continue;
            }
            final byte[] content = entries.get(name);
            if (content == null || !md5Matches(name, content)) {
                throw new ArchiveMalformed();
            }
        }
    }

    private static String assetName(final JsonNode asset) {
        final JsonNode md5ext = asset.get("md5ext");
        if (md5ext == null || !md5ext.isTextual()) {
            final JsonNode assetId = asset.get("assetId");
            final JsonNode dataFormat = asset.get("dataFormat");
            if (assetId == null || dataFormat == null || !assetId.isTextual() || !dataFormat.isTextual()) {
                throw new ArchiveMalformed();
            }
            return validateAssetIdentifier(assetId.asString() + "." + dataFormat.asString());
        }
        return validateAssetIdentifier(md5ext.asString());
    }

    private static String validateAssetIdentifier(final String name) {
        final int separator = name.lastIndexOf('.');
        if (
            separator != 32 || !name.substring(0, separator).matches("[0-9a-fA-F]{32}")
                || !name.substring(separator + 1).matches("[A-Za-z0-9]{1,10}")
        ) {
            throw new ArchiveMalformed();
        }
        return name;
    }

    private static boolean md5Matches(final String name, final byte[] content) {
        final int separator = name.lastIndexOf('.');
        final String actual = HexFormat.of().formatHex(digest("MD5", content));
        return actual.equalsIgnoreCase(name.substring(0, separator));
    }

    private static void validatePrivateBundle(final Map<String, byte[]> entries, final byte[] projectJson)
        throws IOException {
        final String manifestName = privateName(entries, MANIFEST_NAME);
        final String metadataName = privateName(entries, METADATA_NAME);
        if (manifestName == null && metadataName == null) {
            return;
        }
        if (manifestName == null || metadataName == null) {
            throw new ArchiveMalformed();
        }
        final byte[] manifestBytes = entries.get(manifestName);
        final byte[] metadataBytes = entries.get(metadataName);
        final JsonNode manifest = readJson(manifestBytes);
        final JsonNode metadata = readJson(metadataBytes);
        validateManifestShape(manifest, metadata, projectJson, metadataBytes);
        final Set<String> manifestAssets = new TreeSet<>();
        validateManifestAssets(entries, manifest, manifestAssets);
        if (!manifestAssets.containsAll(referencedAssetNames(projectJson))) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateManifestShape(
        final JsonNode manifest,
        final JsonNode metadata,
        final byte[] projectJson,
        final byte[] metadataBytes
    ) {
        validateManifestObjects(manifest, metadata);
        validateManifestIdentity(manifest);
        final String projectHash = manifest.path("projectJsonSha256").stringValue(null);
        final String metadataHash = manifest.path("metadataSha256").stringValue(null);
        validateManifestHashes(projectHash, metadataHash, projectJson, metadataBytes);
        if (!manifest.path("assets").isArray()) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateManifestObjects(final JsonNode manifest, final JsonNode metadata) {
        if (!manifest.isObject() || !metadata.isObject()) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateManifestIdentity(final JsonNode manifest) {
        if (
            !"scratch-project-bundle".equals(manifest.path("format").stringValue(null))
                || manifest.path("version").asInt(-1) < 2
        ) {
            throw new ArchiveMalformed();
        }
        if (
            blank(manifest.path("projectId").stringValue(null)) || blank(manifest.path("fetchedAt").stringValue(null))
        ) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateManifestHashes(
        final String projectHash,
        final String metadataHash,
        final byte[] projectJson,
        final byte[] metadataBytes
    ) {
        if (!validHex(projectHash, 64) || !validHex(metadataHash, 64)) {
            throw new ArchiveMalformed();
        }
        if (!HexFormat.of().formatHex(digest("SHA-256", projectJson)).equalsIgnoreCase(projectHash)) {
            throw new ArchiveMalformed();
        }
        if (!HexFormat.of().formatHex(digest("SHA-256", metadataBytes)).equalsIgnoreCase(metadataHash)) {
            throw new ArchiveMalformed();
        }
    }

    private static void validateManifestAssets(
        final Map<String, byte[]> entries,
        final JsonNode manifest,
        final Set<String> manifestAssets
    ) {
        for (JsonNode asset : manifest.path("assets")) {
            validateManifestAsset(entries, asset, manifestAssets);
        }
    }

    private static void validateManifestAsset(
        final Map<String, byte[]> entries,
        final JsonNode asset,
        final Set<String> manifestAssets
    ) {
        if (asset == null || !asset.isObject()) {
            throw new ArchiveMalformed();
        }
        final String name = asset.path("name").stringValue(null);
        final String hash = asset.path("sha256").stringValue(null);
        if (name == null || !manifestAssets.add(name) || !validHex(hash, 64)) {
            throw new ArchiveMalformed();
        }
        validateEntryName(name);
        final byte[] content = entries.get(name);
        if (content == null || !HexFormat.of().formatHex(digest("SHA-256", content)).equalsIgnoreCase(hash)) {
            throw new ArchiveMalformed();
        }
    }

    private static Set<String> referencedAssetNames(final byte[] projectJson) throws IOException {
        return collectReferencedAssets(readJson(projectJson).path("targets"), null);
    }

    private static String privateName(final Map<String, byte[]> entries, final String expected) {
        final String lowerExpected = expected.toLowerCase(Locale.ROOT);
        return entries.keySet().stream()
            .filter(name -> name.toLowerCase(Locale.ROOT).equals(lowerExpected))
            .findFirst()
            .orElse(null);
    }

    private static boolean isPrivate(final String name) {
        return name.toLowerCase(Locale.ROOT).startsWith(PRIVATE_PREFIX);
    }

    private static boolean blank(final String value) {
        return value == null || value.isBlank();
    }

    private static boolean validHex(final String value, final int length) {
        return value != null && value.length() == length && value.matches("[0-9a-fA-F]+");
    }

    private static byte[] digest(final String algorithm, final byte[] content) {
        try {
            return MessageDigest.getInstance(algorithm).digest(content);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(algorithm + " is unavailable", exception);
        }
    }

    record Limits(
        int maxEntries,
        long maxCompressedBytes,
        long maxUncompressedBytes,
        long maxEntryBytes
    ) {
    }

    record ValidatedArchive(byte[] projectJson, Map<String, byte[]> entries) {

        ValidatedArchive {
            projectJson = projectJson.clone();
            final Map<String, byte[]> copied = new LinkedHashMap<>();
            entries.forEach((name, content) -> copied.put(name, content.clone()));
            entries = Collections.unmodifiableMap(copied);
        }

        @Override
        public byte[] projectJson() {
            return projectJson.clone();
        }
    }

    static final class ArchiveMalformed extends RuntimeException {

        private static final long serialVersionUID = 1L;
    }

    static final class ArchiveLimitExceeded extends RuntimeException {

        private static final long serialVersionUID = 1L;
    }

    private static final class BoundedOutputStream extends OutputStream {

        private final long limit;
        private final ByteArrayOutputStream delegate;

        private BoundedOutputStream(final long limit) {
            if (limit < 1 || limit > Integer.MAX_VALUE) {
                throw new ArchiveLimitExceeded();
            }
            this.limit = limit;
            delegate = new ByteArrayOutputStream(Math.min((int) limit, 8192));
        }

        @Override
        public void write(final int value) {
            ensureCapacity(1);
            delegate.write(value);
        }

        @Override
        public void write(final byte[] bytes, final int offset, final int length) {
            if (bytes == null || offset < 0 || length < 0 || offset > bytes.length - length) {
                throw new IndexOutOfBoundsException();
            }
            ensureCapacity(length);
            delegate.write(bytes, offset, length);
        }

        private void ensureCapacity(final int length) {
            if (length > limit - delegate.size()) {
                throw new ArchiveLimitExceeded();
            }
        }

        private byte[] toByteArray() {
            return delegate.toByteArray();
        }
    }
}
