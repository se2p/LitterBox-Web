// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const { convertToSVG } = require("./util");

process.on("message", ({ projectData, spriteNames, scale }) => {
    convertToSVG(projectData, spriteNames, scale)
        .then((screenshots) => {
            process.send(
                {
                    ok: true,
                    screenshots: screenshots,
                },
                () => process.exit(0),
            );
        })
        .catch((err) => {
            process.send(
                {
                    ok: false,
                    message: err.message,
                    stack: err.stack,
                },
                () => process.exit(1),
            );
        });
});
