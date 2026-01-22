// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const express = require("express");
const path = require("path");
const { fork } = require("child_process");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

const hostname = "127.0.0.1";
const port = Number(process.env.SCREENSHOT_PORT ?? 3001);

function screenshot(projectData, spriteNames, scale) {
    return new Promise((resolve, reject) => {
        const child = fork(path.join(__dirname, "worker.js"));

        child.on("message", (result) => {
            if (result.ok) {
                resolve(result.screenshots);
            } else {
                reject({
                    message: result.message,
                    stack: result.stack,
                });
            }
        });

        child.send({ projectData, spriteNames, scale });
    });
}

// Create HTTP server
app.post("/svg", (req, res) => {
    const projectData = req.body;

    let sprites = req.query.sprites || [];
    if (typeof sprites === "string") sprites = [sprites];

    screenshot(projectData, sprites, req.query.scale)
        .then((spritesSVG) => {
            res.statusCode = 200;
            res.json({ screenshots: spritesSVG });
        })
        .catch((err) => {
            console.error(err);
            res.status(400).send({ message: err.message, stack: err.stack });
        });
});

const server = app.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function shutdownHandler() {
    setTimeout(() => {
        server.close(function () {
            process.exit();
        });
    }, 0);
}

const ignoreUnhandleRejectionErrors = [
    // scratch-vm loads all sounds when init Scratch3MusicBlocks.
    // but it's not possible in JSDOM environment due to lack of AudioContext API.
    "No Audio Context Detected",
];

process.on("unhandledRejection", (err, _origin) => {
    if (!ignoreUnhandleRejectionErrors.includes(err.message)) {
        throw err;
    }
    console.log(`Ignore unhandled rejection: ${err}`);
});
process.on("SIGINT", shutdownHandler);
process.on("SIGTERM", shutdownHandler);
