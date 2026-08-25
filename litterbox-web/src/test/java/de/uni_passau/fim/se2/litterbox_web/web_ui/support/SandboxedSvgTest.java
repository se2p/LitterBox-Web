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

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SandboxedSvgTest {

    @Test
    void acceptsAPlainScratchCostume() {
        assertThat(isPreviewable("<rect width=\"4\" height=\"4\" fill=\"#00a9c7\"/>")).isTrue();
    }

    @Test
    void acceptsAnInlineRasterReference() {
        assertThat(isPreviewable("<image xlink:href=\"data:image/png;base64,iVBORw0KGgo=\"/>")).isTrue();
        assertThat(isPreviewable("<image href=\"data:image/webp;base64,UklGRg==\"/>")).isTrue();
    }

    @Test
    void acceptsASameDocumentReference() {
        assertThat(isPreviewable("<defs><linearGradient id=\"g\"/></defs><rect fill=\"url(#g)\" href=\"#g\"/>"))
            .isTrue();
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "<script>alert(1)</script>",
            "<rect onload=\"alert(1)\"/>",
            "<rect ONCLICK=\"alert(1)\"/>",
            "<a href=\"https://example.invalid\"><rect/></a>",
            "<image xlink:href=\"/litterbox/api/v1/capabilities\"/>",
            "<foreignObject><p xmlns=\"http://www.w3.org/1999/xhtml\">hi</p></foreignObject>",
            "<iframe src=\"data:text/html,hi\"></iframe>",
            "<a href=\"javascript:alert(1)\"><rect/></a>",
        }
    )
    void rejectsActiveOrExternalContent(final String body) {
        assertThat(isPreviewable(body)).isFalse();
    }

    /**
     * The bypass this check was rewritten for. A prefix is a name the document chose for a namespace, and a browser
     * resolves it before deciding what an element is: bound to the SVG namespace, {@code <s:script>} is the same
     * {@code SVGScriptElement} as {@code <script>} and Chromium runs it. Matching the spelling saw two different
     * elements, so the spelling is no longer what is matched.
     */
    @ParameterizedTest
    @ValueSource(
        strings = {
            "<s:script>alert(1)</s:script>",
            "<s:foreignObject><s:rect/></s:foreignObject>",
            "<s:iframe/>",
            "<s:embed/>",
            "<s:object/>",
            "<s:audio/>",
            "<s:video/>",
            "<s:handler/>",
        }
    )
    void rejectsForbiddenElementsUnderAnAliasOfTheSvgNamespace(final String body) {
        final String document = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:s=\"http://www.w3.org/2000/svg\">"
            + body + "</svg>";

        assertThat(SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8))).isFalse();
    }

    /** The prefix for XLink is equally the document's to choose, so the attribute is read by namespace and name. */
    @Test
    void rejectsAnExternalReferenceUnderAnyXlinkPrefix() {
        final String document = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:whatever=\"http://www.w3.org/1999/xlink\">"
            + "<image whatever:href=\"https://example.invalid/ping\"/></svg>";

        assertThat(SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8))).isFalse();
    }

    @Test
    void rejectsAnEventHandlerUnderAPrefix() {
        final String document = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:x=\"urn:synthetic\">"
            + "<rect x:onload=\"alert(1)\"/></svg>";

        assertThat(SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8))).isFalse();
    }

    /**
     * A costume that passed the check could otherwise carry a second document that never has to pass it, so the inline
     * data allowance names the raster formats assets are stored in rather than {@code image/} at large.
     */
    @ParameterizedTest
    @ValueSource(
        strings = {
            "<image xlink:href=\"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=\"/>",
            "<image xlink:href=\"data:image/svg+xml,%3Csvg%3E%3C/svg%3E\"/>",
            "<image href=\"data:image/x-icon;base64,AAABAA==\"/>",
        }
    )
    void rejectsInlineDataThatIsNotOneOfTheStoredRasterFormats(final String body) {
        assertThat(isPreviewable(body)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "<html>synthetic</html>",
            "<svg><rect/></svg>",
            "<svg xmlns=\"http://www.w3.org/1999/xhtml\"><rect/></svg>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"/><svg xmlns=\"http://www.w3.org/2000/svg\"/>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/></svg>trailing",
            "not xml at all",
        }
    )
    void rejectsAnythingThatIsNotOneWellFormedSvgDocument(final String document) {
        assertThat(SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8))).isFalse();
    }

    @Test
    void rejectsEmptyContent() {
        assertThat(SandboxedSvg.isPreviewable(new byte[0])).isFalse();
        assertThat(SandboxedSvg.isPreviewable(null)).isFalse();
    }

    /**
     * The costume below would be a valid one if its entity were resolved, so refusing it is the whole of the evidence
     * that nothing resolved it: the parser stops at the DOCTYPE, before an external identifier is anything it would act
     * on. The same document with the text already in place is accepted, which is what makes the refusal attributable to
     * the DTD rather than to the markup around it.
     */
    @Test
    void rejectsADoctypeWithoutReadingWhatItPointsAt(@TempDir final Path directory) throws Exception {
        final Path secret = directory.resolve("secret.txt");
        Files.writeString(secret, "borrowed");
        final String withEntity = "<!DOCTYPE svg [<!ENTITY leak SYSTEM \"" + secret.toUri() + "\">]>"
            + "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>&leak;</text></svg>";
        final String withoutEntity = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>borrowed</text></svg>";

        assertThat(SandboxedSvg.isPreviewable(withEntity.getBytes(StandardCharsets.UTF_8))).isFalse();
        assertThat(SandboxedSvg.isPreviewable(withoutEntity.getBytes(StandardCharsets.UTF_8))).isTrue();
    }

    @Test
    void rejectsAnExternalStylesheetInstruction() {
        final String document = "<?xml-stylesheet href=\"https://example.invalid/costume.css\" type=\"text/css\"?>"
            + "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/></svg>";

        assertThat(SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8))).isFalse();
    }

    /**
     * The contract this check does <em>not</em> offer, pinned so that nobody reads an acceptance here as a claim of
     * safety. Every document below is a published bypass of Scratch's own SVG sanitiser, and every one of them is
     * admitted: they are CSS, and CSS only does anything once the document is inlined into a page. What stops them is
     * that a costume is served under {@code default-src 'none'; sandbox} and rendered through an {@code img} element,
     * which is a claim about a browser and so is answered by one, in {@code e2e/costume-containment.spec.ts}.
     *
     * <p>
     * Making any of these fail by adding a pattern for it would be answering the wrong question: the next spelling is
     * always cheaper to write than the rule that catches it. If one of them should genuinely stop being served, take it
     * out of the admitted set here <em>and</em> say why the containment was not enough.
     */
    @ParameterizedTest
    @ValueSource(
        strings = {
            "<style>@import url(\"https://example.invalid/ping\");</style>",
            "<rect style=\"background-image: url(https://example.invalid/ping)\"/>",
            "<circle fill=\"\\75\\72\\6c(https://example.invalid/ping)\"/>",
            "<style>.a { background-image: url(https://a.invalid/p), url(https://b.invalid/p); }</style>",
            "<style>:root { --x: url(https://example.invalid/ping); } .a { background-image: var(--x); }</style>",
            "<style>.a { background-image: image-set(\"https://example.invalid/ping\" 1x); }</style>",
            "<style>* { transform: scale(10000) !important; transition: all 9999s ease !important; }</style>",
            "<style>g { rect { background-image: url(https://example.invalid/ping); } }</style>",
        }
    )
    void admitsCssItDoesNotClaimToJudge(final String body) {
        assertThat(isPreviewable(body)).isTrue();
    }

    private boolean isPreviewable(final String body) {
        final String document = "<svg xmlns=\"http://www.w3.org/2000/svg\" "
            + "xmlns:xlink=\"http://www.w3.org/1999/xlink\">" + body + "</svg>";
        return SandboxedSvg.isPreviewable(document.getBytes(StandardCharsets.UTF_8));
    }
}
