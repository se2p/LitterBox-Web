// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const fs = require("node:fs");
const path = require("node:path");

function embedImages(svgElement) {
    for (const image of svgElement.querySelectorAll("image")) {
        const href =
            image.getAttribute("href") || image.getAttribute("xlink:href");
        if (!href) continue;
        let embedded = href;
        if (!href.startsWith("data:")) {
            const mime = {
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".webp": "image/webp",
            }[path.extname(href).toLowerCase()];
            if (!mime) throw new Error(`Unsupported image type: ${href}`);
            embedded = `data:${mime};base64,${fs.readFileSync(href).toString("base64")}`;
        }
        for (const attribute of ["href", "xlink:href"]) {
            if (image.hasAttribute(attribute))
                image.setAttribute(attribute, embedded);
        }
    }
}

// Inline inherited CSS variables that jsdom leaves unresolved for SVG rasterizers.
function resolveCssVariables(element, value) {
    return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
        for (let parent = element; parent; parent = parent.parentElement) {
            const variable = parent.ownerDocument.defaultView
                .getComputedStyle(parent)
                .getPropertyValue(name)
                .trim();
            if (variable) return variable;
        }
        return "";
    });
}

function applyComputedStyles(element) {
    const styles = element.ownerDocument.defaultView.getComputedStyle(element);
    for (const name of styles) {
        // jsdom's font shorthand can retain values overridden by its longhands.
        if (name === "font") continue;
        element.style.setProperty(
            name,
            resolveCssVariables(element, styles.getPropertyValue(name)),
        );
    }
    for (const child of element.children) applyComputedStyles(child);
}

function serializeComments(workspace) {
    // SVG rasterizers cannot render Blockly's HTML comment editors.
    const svg = workspace.getParentSvg();
    const document = svg.ownerDocument;
    const context = document.createElement("canvas").getContext("2d");
    // svglib renders transparent selection outlines as opaque rectangles.
    for (const highlight of svg.querySelectorAll(".blocklyCommentHighlight"))
        highlight.remove();
    for (const background of svg.querySelectorAll(
        ".blocklyCommentTopbarBackground",
    )) {
        background.setAttribute(
            "height",
            document.defaultView.getComputedStyle(background).height,
        );
    }
    for (const editor of svg.querySelectorAll(".blocklyCommentForeignObject")) {
        const textarea = editor.querySelector("textarea");
        const style = document.defaultView.getComputedStyle(textarea);
        // svglib ignores display:none on nested SVGs; omit hidden editors entirely.
        if (document.defaultView.getComputedStyle(editor).display === "none") {
            editor.remove();
            continue;
        }
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const padding = Number.parseFloat(style.paddingLeft);
        const metrics = context.measureText("Mg");
        const lineHeight =
            metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
        const width = Number(editor.getAttribute("width"));
        const body = document.createElementNS(svg.namespaceURI, "svg");
        for (const { name, value } of editor.attributes)
            body.setAttribute(name, value);
        body.style.setProperty("overflow", "hidden");
        const background = document.createElementNS(svg.namespaceURI, "rect");
        background.setAttribute("width", "100%");
        background.setAttribute("height", "100%");
        background.setAttribute(
            "fill",
            resolveCssVariables(textarea, style.backgroundColor),
        );
        body.appendChild(background);
        let y = padding + metrics.fontBoundingBoxAscent;
        const appendLine = (line) => {
            const text = document.createElementNS(svg.namespaceURI, "text");
            text.setAttribute("x", padding);
            text.setAttribute("y", y);
            text.setAttribute("font-family", style.fontFamily);
            text.setAttribute("font-size", style.fontSize);
            text.setAttribute("font-weight", style.fontWeight);
            text.setAttribute("fill", style.color);
            text.setAttributeNS(
                "http://www.w3.org/XML/1998/namespace",
                "xml:space",
                "preserve",
            );
            text.textContent = line;
            body.appendChild(text);
            y += lineHeight;
        };
        for (const paragraph of textarea.value.split(/\r?\n/)) {
            let line = "";
            for (const word of paragraph.split(/(\s+)/)) {
                if (
                    line &&
                    context.measureText(line + word).width > width - 2 * padding
                ) {
                    appendLine(line);
                    line = "";
                }
                for (const character of word) {
                    if (
                        line &&
                        context.measureText(line + character).width >
                            width - 2 * padding
                    ) {
                        appendLine(line);
                        line = "";
                    }
                    line += character;
                }
            }
            appendLine(line);
        }
        editor.replaceWith(body);
    }
    // Readability expects only scripts in the block canvas, as in Scratch Blocks v1.
    for (const comment of svg.querySelectorAll(
        ".blocklyBlockCanvas > .blocklyComment",
    ))
        workspace.getBubbleCanvas().appendChild(comment);
}

function addBlockMetadata(ScratchBlocks, block) {
    const element = block.getSvgRoot();
    const category = block.getCategory?.() ?? block.getStyleName();
    if (category && category !== "textField") {
        element.setAttribute(
            "data-category",
            {
                event: "events",
                more: "custom",
                data_lists: "data",
            }[category] || category,
        );
    }
    let argumentType;
    if (block.type === "math_angle") argumentType = "text angle";
    else if (block.type.startsWith("math_")) argumentType = "text number";
    else if (block.type === "text") argumentType = "text";
    else if (block.type === "colour_picker") argumentType = "colour";
    else if (block.type === "procedures_prototype") argumentType = "procedure";
    else if (block.isShadow()) argumentType = "dropdown";
    if (argumentType) element.setAttribute("data-argument-type", argumentType);

    let shape;
    if (argumentType) shape = "argument round";
    else if (block.outputConnection) {
        shape =
            block.getOutputShape() === ScratchBlocks.OUTPUT_SHAPE_HEXAGONAL
                ? "reporter boolean"
                : "reporter round";
    } else if (block.hat) shape = "hat";
    else {
        const statements = block.inputList.filter(
            (input) => input.type === ScratchBlocks.inputs.inputTypes.STATEMENT,
        ).length;
        shape = statements ? `c-block c-${statements}` : "stack";
        if (!block.nextConnection) shape += " end";
    }
    element.setAttribute("data-shapes", shape);
}

function serializeWorkspace(ScratchBlocks, workspace) {
    const svg = workspace.getParentSvg();
    serializeComments(workspace);
    svg.setAttribute("width", "1920px");
    svg.setAttribute("height", "1080px");
    const bounds = workspace.getBlocksBoundingBox();
    const transform = `translate(${16 - bounds.left * workspace.scale},${16 - bounds.top * workspace.scale}) scale(${workspace.scale})`;
    workspace.getCanvas().setAttribute("transform", transform);
    workspace.getBubbleCanvas().setAttribute("transform", transform);
    svg.style.setProperty("background-color", "#ffffff");
    svg.querySelector(".blocklyMainBackground").style.setProperty(
        "fill",
        "#ffffff",
    );
    for (const block of workspace.getAllBlocks(false))
        addBlockMetadata(ScratchBlocks, block);
    // Readability's legacy transform parser splits functions on whitespace.
    for (const element of svg.querySelectorAll("[transform]")) {
        element.setAttribute(
            "transform",
            element.getAttribute("transform").replace(/,\s+/g, ","),
        );
    }
    embedImages(svg);
    applyComputedStyles(svg);
    return svg.outerHTML.replaceAll("&nbsp;", " ");
}

module.exports = { embedImages, serializeWorkspace };
