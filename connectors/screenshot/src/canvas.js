// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const font = require.resolve("scratch-render-fonts/src/NotoSans-Medium.ttf");
for (const family of [
    "Helvetica Neue",
    "Segoe UI",
    "Helvetica",
    "sans-serif",
]) {
    GlobalFonts.registerFromPath(font, family);
}

module.exports = (window) => {
    const canvases = new WeakMap();
    window.HTMLCanvasElement.prototype.getContext = function (type) {
        if (type !== "2d") return null;
        let canvas = canvases.get(this);
        if (!canvas) {
            canvas = createCanvas(this.width, this.height);
            canvases.set(this, canvas);
        }
        if (canvas.width !== this.width) canvas.width = this.width;
        if (canvas.height !== this.height) canvas.height = this.height;
        return canvas.getContext("2d");
    };
};
