// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const fs = require("node:fs");
const { convertToSVG } = require("../src/util");
const project = require("./synthetic-project");

async function main() {
    const screenshots = {};
    for (const scale of [0.5625, 1]) {
        screenshots[scale] = await convertToSVG(
            structuredClone(project),
            ["Synthetic Sprite", "Synthetic Clone"],
            scale,
        );
    }
    fs.writeFileSync(process.argv[2], JSON.stringify(screenshots));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
