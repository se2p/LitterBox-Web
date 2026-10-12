/*
 * Copyright (C) 2024-2026 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 * Licenced under the EUPL-1.2 or later.
 *
 * SPDX-FileCopyrightText: 2024-2026 LitterBox-Web contributors
 * SPDX-License-Identifier: EUPL-1.2
 */
package de.uni_passau.fim.se2.litterbox_web.web_ui.support;

import java.io.ByteArrayInputStream;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Admission check for learner-supplied vector costumes. This is not a sanitiser: a document it accepts is not safe by
 * itself, since CSS alone offers renderer capabilities a string-level check cannot keep up with, so this only refuses
 * markup that is active on its face.
 *
 * <p>
 * Safety instead comes from containment: an accepted costume is served only from the submission asset endpoint under
 * {@code default-src 'none'; sandbox}, and rendered only through an {@code img} element, which the browser loads in its
 * restricted image mode with no scripting and no reach into the surrounding document. Content admitted here must never
 * be inlined into the application DOM, rendered through {@code object}, {@code embed} or an iframe, or handed to
 * anything that parses it and attaches the result — any of those puts the document back in a context this check does
 * not cover.
 *
 * <p>
 * Judged on namespace and local name, since a costume is parsed as XML: {@code <s:script>} under an alias of the SVG
 * namespace is the same element as {@code <script>}, and Chromium runs it.
 */
public final class SandboxedSvg {

    public static final String MEDIA_TYPE = "image/svg+xml";

    private static final String SVG_NAMESPACE = "http://www.w3.org/2000/svg";

    /**
     * Matched on local name in any namespace: a costume has no honest use for any of these names, so refusing by name
     * alone is safe without depending on namespace handling.
     */
    private static final Set<String> FORBIDDEN_ELEMENTS = Set.of(
        "script", "foreignobject", "iframe", "embed", "object", "audio", "video", "handler"
    );

    private static final Pattern EVENT_HANDLER_ATTRIBUTE = Pattern.compile("on[a-z]+");

    /**
     * Excludes {@code data:image/svg+xml} deliberately, which would otherwise smuggle a second document past the check
     * the first one just passed.
     */
    private static final Pattern INLINE_RASTER = Pattern.compile(
        "data:image/(?:png|jpeg|gif|webp)[;,].*", Pattern.DOTALL
    );

    private SandboxedSvg() {
    }

    /**
     * A factory of its own for each document, since {@link XMLInputFactory} is not thread-safe and costumes are judged
     * on several pool threads at once. DTDs are disabled entirely and the resolver refuses any external reference, so
     * there is no entity to expand and nothing an external identifier can name.
     */
    private static XMLInputFactory secureFactory() {
        final XMLInputFactory factory = XMLInputFactory.newInstance();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
        factory.setXMLResolver((publicId, systemId, baseUri, namespace) -> {
            throw new XMLStreamException("Costumes may not reference " + systemId);
        });
        return factory;
    }

    /**
     * Whether this content may be stored and served as a costume preview.
     *
     * <p>
     * A {@code true} answer means only that the document parses as SVG and that nothing obviously active was found in
     * its markup. It is not a statement about the document's CSS, and it is conditional on the caller honouring the
     * containment described on this class.
     *
     * @param content SVG bytes to inspect
     * @return whether the content can be safely stored as a preview
     */
    public static boolean isPreviewable(final byte[] content) {
        if (content == null || content.length == 0) {
            return false;
        }
        try {
            return readsAsACostume(content);
        }
        catch (XMLStreamException notWellFormed) {
            // Refused rather than guessed at: a browser parsing this differently is exactly the gap being closed.
            return false;
        }
    }

    private static boolean readsAsACostume(final byte[] content) throws XMLStreamException {
        final XMLStreamReader reader = secureFactory().createXMLStreamReader(new ByteArrayInputStream(content));
        try {
            boolean rootRead = false;
            while (reader.hasNext()) {
                final int event = reader.next();
                if (event == XMLStreamConstants.PROCESSING_INSTRUCTION || event == XMLStreamConstants.DTD) {
                    return false;
                }
                if (event != XMLStreamConstants.START_ELEMENT) {
                    continue;
                }
                if (!rootRead && !isSvgRoot(reader)) {
                    return false;
                }
                rootRead = true;
                if (!isAdmissible(reader)) {
                    return false;
                }
            }
            return rootRead;
        }
        finally {
            reader.close();
        }
    }

    private static boolean isSvgRoot(final XMLStreamReader element) {
        return SVG_NAMESPACE.equals(element.getNamespaceURI()) && "svg".equals(element.getLocalName());
    }

    private static boolean isAdmissible(final XMLStreamReader element) {
        if (FORBIDDEN_ELEMENTS.contains(lowerCase(element.getLocalName()))) {
            return false;
        }
        for (int index = 0; index < element.getAttributeCount(); index++) {
            if (!isAdmissibleAttribute(element, index)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Attributes are judged on local name too, so {@code xlink:href} and a reference under any other prefix bound to
     * the XLink namespace are the one attribute they are.
     */
    private static boolean isAdmissibleAttribute(final XMLStreamReader element, final int index) {
        final String name = lowerCase(element.getAttributeLocalName(index));
        if (EVENT_HANDLER_ATTRIBUTE.matcher(name).matches()) {
            return false;
        }
        return !"href".equals(name) || isAdmissibleReference(element.getAttributeValue(index));
    }

    /** Anything that is neither a same-document fragment nor inline raster data, {@code javascript:} included. */
    private static boolean isAdmissibleReference(final String reference) {
        final String target = lowerCase(reference).strip();
        return target.startsWith("#") || INLINE_RASTER.matcher(target).matches();
    }

    private static String lowerCase(final String name) {
        return name == null ? "" : name.toLowerCase(Locale.ROOT);
    }
}
