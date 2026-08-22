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

import java.io.ByteArrayInputStream;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Admission check for learner-supplied vector costumes. Most Scratch costumes are vectors, so refusing them leaves
 * nearly every sprite without a preview.
 *
 * <p>
 * <strong>This is not a sanitiser, and a document it accepts is not safe by itself.</strong> A vector is a document,
 * and what a document does is decided by the browser that renders it, not by the strings it contains. Scratch's own
 * sanitiser has been walked past repeatedly — with {@code <script>}, with event handlers, with {@code <image href>},
 * then with CSS {@code @import}, {@code url()} behind escape sequences, custom properties, {@code image-set()} and
 * page-wide transitions — because each fix denied one spelling of a capability the renderer still offered. Extending
 * this check to chase CSS would be joining that race, so it deliberately stops at markup that is active on its face,
 * and says nothing at all about CSS.
 *
 * <p>
 * What it does say, it says the way the browser reads it. A costume is XML, so it is parsed as XML and judged on
 * namespace and local name: {@code <s:script>} under an alias of the SVG namespace is the same element as
 * {@code <script>}, and Chromium runs it. Matching the spelling rather than the element is how that got missed.
 *
 * <p>
 * What makes an accepted costume harmless is still where it is put, and that containment is the actual security
 * boundary:
 *
 * <ul>
 * <li>it is served only from the submission asset endpoint, under {@code default-src 'none'; sandbox}, so a directly
 * navigated costume sits in an opaque origin and can fetch nothing;</li>
 * <li>it is rendered only through an {@code img} element, which the browser loads in its restricted image mode: no
 * scripting, no external references, and no reach into the surrounding document.</li>
 * </ul>
 *
 * <p>
 * It follows that content admitted here must never be inlined into the application DOM, rendered through
 * {@code object}, {@code embed} or an iframe, or handed to anything that parses it and attaches the result. Any of
 * those puts the document back in a context where the CSS above works, and the check made here will not stop it.
 */
public final class SandboxedSvg {

    public static final String MEDIA_TYPE = "image/svg+xml";

    private static final String SVG_NAMESPACE = "http://www.w3.org/2000/svg";

    /**
     * Elements that are active however they are reached, matched on local name in any namespace. The SVG namespace is
     * what makes a browser act on most of these, but a costume has no honest use for any of these names anywhere, and
     * refusing the name outright costs nothing and does not depend on reading namespaces the way the browser does.
     */
    private static final Set<String> FORBIDDEN_ELEMENTS = Set.of(
        "script", "foreignobject", "iframe", "embed", "object", "audio", "video", "handler"
    );

    private static final Pattern EVENT_HANDLER_ATTRIBUTE = Pattern.compile("on[a-z]+");

    /**
     * Inline data in one of the raster formats assets are stored in. Notably this refuses a nested
     * {@code data:image/svg+xml}, which would otherwise smuggle a second document in past the check the first one just
     * passed.
     */
    private static final Pattern INLINE_RASTER = Pattern.compile(
        "data:image/(?:png|jpeg|gif|webp)[;,].*", Pattern.DOTALL
    );

    private SandboxedSvg() {
    }

    /**
     * A factory of its own for each document, because {@link XMLInputFactory} does not promise to be thread-safe and
     * costumes are judged on several pool threads at once. Configuring one instance and then leaving it alone is not
     * enough to rely on: an implementation is free to keep mutable state for creating readers, and this decision is a
     * security one, so it may not rest on behaviour no interface promises. An object that is never shared cannot be
     * shared wrongly, and that argument holds for every provider.
     *
     * <p>
     * Every door to something outside the document is shut here rather than guarded later: no DTD at all, so no entity
     * to expand and nothing for an external identifier to name, and a resolver that refuses regardless.
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
     */
    public static boolean isPreviewable(final byte[] content) {
        if (content == null || content.length == 0) {
            return false;
        }
        try {
            return readsAsACostume(content);
        }
        catch (XMLStreamException notWellFormed) {
            // Anything the parser will not read whole — a DOCTYPE, a second root, a truncated file — is refused
            // rather than guessed at, because a browser guessing differently is exactly the gap being closed.
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
