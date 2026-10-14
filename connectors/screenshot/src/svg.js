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

function applyComputedStyles(element) {
    const styles = element.ownerDocument.defaultView.getComputedStyle(element);
    for (const name of styles) {
        element.style.setProperty(name, styles.getPropertyValue(name));
    }
    for (const child of element.children) applyComputedStyles(child);
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
