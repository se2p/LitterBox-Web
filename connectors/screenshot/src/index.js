// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const express = require('express')
const {convertToSVG} = require('./util');

const app = express()
app.use(express.json());
app.use(express.urlencoded({extended: true}));

const hostname = "127.0.0.1";
const port = Number(process.env.SCREENSHOT_PORT ?? 3001);

// Create HTTP server
app.post('/svg', (req, res) => {
    const projectData = req.body;

    convertToSVG(
        projectData,
        req.query.sprite,
        req.query.scale,
    )
        .then((svgString) => {
            res.statusCode = 200;
            res.json({
                svg: svgString,
            });
        })
        .catch((err) => {
            console.error(err)
            res.status(400).send(err)
        });
});

app.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
})
