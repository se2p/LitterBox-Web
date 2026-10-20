// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

// Blockly's comment layout measures SVG rectangles, icons, text and their group.
// jsdom supplies CSS but no SVG geometry or visibility checks.
module.exports = (window) => {
    const context = window.document.createElement("canvas").getContext("2d");
    window.SVGElement.prototype.getBBox = function () {
        const style = window.getComputedStyle(this);
        const number = (name) => {
            const css = Number.parseFloat(style.getPropertyValue(name));
            return Number.isFinite(css)
                ? css
                : Number.parseFloat(this.getAttribute(name)) || 0;
        };
        if (this.localName === "g") {
            const boxes = Array.from(this.children, (child) => child.getBBox());
            if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
            const x = Math.min(...boxes.map((box) => box.x));
            const y = Math.min(...boxes.map((box) => box.y));
            return {
                x,
                y,
                width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
                height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
            };
        }
        if (this.localName === "text") {
            context.font = `${style.fontWeight || "normal"} ${style.fontSize || "12px"} ${style.fontFamily || "Helvetica Neue"}`;
            const metrics = context.measureText(this.textContent);
            const ascent = metrics.fontBoundingBoxAscent;
            const height = ascent + metrics.fontBoundingBoxDescent;
            return {
                x: number("x"),
                y:
                    number("y") -
                    (style.dominantBaseline === "middle" ? height / 2 : ascent),
                width: metrics.width,
                height,
            };
        }
        return {
            x: number("x"),
            y: number("y"),
            width: number("width"),
            height: number("height"),
        };
    };
    window.Element.prototype.checkVisibility = function () {
        if (!this.isConnected) return false;
        for (let element = this; element; element = element.parentElement) {
            const style = window.getComputedStyle(element);
            if (style.display === "none") return false;
        }
        return true;
    };
};
