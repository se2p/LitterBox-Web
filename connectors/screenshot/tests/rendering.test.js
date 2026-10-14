// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { before, after, test } = require("node:test");
const project = require("./synthetic-project");
const { convertToSVG } = require("../src/util");
const defineDynamicBlock = require("../src/lib/define-dynamic-block");
const { embedImages, serializeWorkspace } = require("../src/svg");
const createTheme = require("../src/theme");

let server;
let baseUrl;
let output = "";

before(async () => {
    server = spawn(
        process.execPath,
        [path.join(__dirname, "../src/index.js")],
        {
            env: { ...process.env, SCREENSHOT_PORT: "0" },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    await new Promise((resolve, reject) => {
        const fail = (error) => {
            clearTimeout(timer);
            reject(error);
        };
        const timer = setTimeout(() => fail(new Error(output)), 10_000);
        server.once("error", fail);
        const onExit = () =>
            fail(new Error(`Screenshot server exited: ${output}`));
        server.once("exit", onExit);
        server.stdout.on("data", (bytes) => {
            output += bytes;
            const match = output.match(
                /Server running at (http:\/\/127\.0\.0\.1:\d+\/)/,
            );
            if (match) {
                baseUrl = match[1];
                clearTimeout(timer);
                server.removeListener("exit", onExit);
                resolve();
            }
        });
        server.stderr.on("data", (bytes) => {
            output += bytes;
        });
    });
});

after(() => server?.kill("SIGTERM"));

test("loads dynamic extension arguments and reporter shapes with the current Blockly API", () => {
    const ScratchBlocks = require("scratch-blocks");
    ScratchBlocks.Blocks.synthetic_dynamic = defineDynamicBlock(
        ScratchBlocks,
        { id: "synthetic", name: "Synthetic", color1: "#0fbd8c" },
        {},
        "synthetic_dynamic",
    );
    const workspace = new ScratchBlocks.Workspace();
    try {
        const block = workspace.newBlock("synthetic_dynamic");
        const mutation = global.document.createElement("mutation");
        mutation.setAttribute(
            "blockInfo",
            JSON.stringify({
                blockType: "reporter",
                text: "synthetic [TEXT]",
                arguments: { TEXT: { type: "string" } },
            }),
        );
        block.domToMutation(mutation);
        assert(block.getInput("TEXT"));
        assert(block.outputConnection);
        assert.equal(block.getOutputShape(), ScratchBlocks.OUTPUT_SHAPE_ROUND);
    } finally {
        workspace.dispose();
        delete ScratchBlocks.Blocks.synthetic_dynamic;
    }
});

test("renders dynamic palettes and preserves hat/event shapes through theme refreshes", async () => {
    const ScratchBlocks = require("scratch-blocks");
    const category = {
        id: "synthetic",
        name: "Synthetic",
        color1: "#0fbd8c",
        color2: "#ff00ff",
        color3: "#123456",
    };
    ScratchBlocks.Blocks.synthetic_dynamic = defineDynamicBlock(
        ScratchBlocks,
        category,
        {},
        "synthetic_dynamic",
    );
    const theme = createTheme(ScratchBlocks);
    theme.setBlockStyle(category.id, {
        colourPrimary: category.color1,
        colourSecondary: category.color2,
        colourTertiary: category.color3,
    });
    const container = global.document.createElement("div");
    global.document.body.appendChild(container);
    const workspace = ScratchBlocks.inject(container, {
        readOnly: true,
        scrollbars: false,
        sounds: false,
        theme,
    });
    const variants = [
        ["default", "reporter", {}],
        ["primary override", "reporter", { color1: "#663399" }],
        [
            "secondary and tertiary override",
            "reporter",
            { color2: "#abcdef", color3: "#654321" },
        ],
        ["hat", "hat", {}],
        [
            "event with override",
            "event",
            { color2: "#fedcba", color3: "#234567" },
        ],
    ];
    try {
        for (const [id, blockType, overrides] of variants) {
            const block = workspace.newBlock("synthetic_dynamic", id);
            block.initSvg();
            const mutation = global.document.createElement("mutation");
            mutation.setAttribute(
                "blockInfo",
                JSON.stringify({
                    blockType,
                    text: "synthetic [TEXT]",
                    arguments: { TEXT: { type: "string" } },
                    ...overrides,
                }),
            );
            block.domToMutation(mutation);
            block.render();
        }
        workspace.setTheme(theme);
        await ScratchBlocks.renderManagement.finishQueuedRenders();
        serializeWorkspace(ScratchBlocks, workspace);
        for (const [id, blockType, overrides] of variants) {
            const block = workspace.getBlockById(id);
            const root = block.getSvgRoot();
            const blockPath = root.querySelector(".blocklyPath");
            assert.equal(
                block.getColour(),
                overrides.color1 ?? category.color1,
            );
            assert.equal(
                blockPath.getAttribute("fill"),
                overrides.color1 ?? category.color1,
            );
            assert.equal(
                blockPath.getAttribute("stroke"),
                overrides.color3 ?? category.color3,
            );
            assert.equal(root.getAttribute("data-category"), category.id);
            assert.equal(
                root.getAttribute("data-shapes"),
                blockType === "reporter" ? "reporter round" : "hat",
            );
            if (blockType === "reporter") block.setShadow(true);
            else {
                assert.equal(block.hat, "cap");
                assert.equal(block.previousConnection, null);
                assert(block.nextConnection);
            }
        }
        await ScratchBlocks.renderManagement.finishQueuedRenders();
        for (const [id, blockType, overrides] of variants) {
            if (blockType !== "reporter") continue;
            const blockPath = workspace
                .getBlockById(id)
                .getSvgRoot()
                .querySelector(".blocklyPath");
            assert.equal(
                blockPath.getAttribute("fill"),
                overrides.color2 ?? category.color2,
            );
        }
    } finally {
        workspace.dispose();
        container.remove();
        delete ScratchBlocks.Blocks.synthetic_dynamic;
    }
});

const request = (value, query = "", raw = false) =>
    fetch(baseUrl + "svg" + query, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw ? value : JSON.stringify(value),
        signal: AbortSignal.timeout(30_000),
    });

function assertRendered(svg) {
    assert.match(svg, /<svg[^>]+xmlns=/);
    assert.match(svg, /fill: rgb\(255, 255, 255\)/);
    assert.doesNotMatch(svg, /class="blocklyZoom/);
    assert.match(svg, /synthetic custom/);
    assert.match(svg, /move/);
    for (const colour of [
        "#4c97ff",
        "#cf63cf",
        "#ffbf00",
        "#ff6680",
        "#0fbd8c",
    ]) {
        assert(svg.includes(colour), `Missing Scratch colour ${colour}`);
    }
    assert.doesNotMatch(svg, /<image[^>]+(?:href|xlink:href)="(?!data:)/);
    assert.match(svg, /<image[^>]+href="data:image\/svg\+xml;base64,/);
}

test("renders stage, sprites, custom blocks, sound menus and pen extensions", async () => {
    const response = await request(project);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(Object.keys(body.screenshots).sort(), [
        "Stage",
        "Synthetic Clone",
        "Synthetic Sprite",
    ]);
    assertRendered(body.screenshots["Synthetic Sprite"]);
    const clone = body.screenshots["Synthetic Clone"];
    assert.match(clone, /second sprite only/);
    assert.doesNotMatch(clone, /synthetic custom/);
    assert.doesNotMatch(
        body.screenshots["Synthetic Sprite"],
        /second sprite only/,
    );
    assert.doesNotMatch(body.screenshots.Stage, /data-id=/);
    for (const svg of Object.values(body.screenshots)) {
        assert.doesNotMatch(svg, /NaN|Infinity/);
        assert.doesNotMatch(svg, /transform="[^"]*,\s/);
    }
});

test("filters sprites and applies the requested scale", async () => {
    const response = await request(
        project,
        "?sprites=Synthetic%20Sprite&scale=1",
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.screenshots), ["Synthetic Sprite"]);
    assertRendered(body.screenshots["Synthetic Sprite"]);
    assert.match(body.screenshots["Synthetic Sprite"], /scale\(1\)/);
    const multiple = await request(
        project,
        "?sprites=Synthetic%20Sprite&sprites=Synthetic%20Clone",
    );
    assert.deepEqual(Object.keys((await multiple.json()).screenshots).sort(), [
        "Synthetic Clone",
        "Synthetic Sprite",
    ]);
});

test("rejects invalid input and oversized bodies, then still renders a valid project", async () => {
    assert.equal((await request("{", "", true)).status, 400);
    assert.equal((await request({ invalid: "synthetic" })).status, 400);
    assert.equal(
        (await request({ synthetic: "x".repeat(51 * 1024 * 1024) })).status,
        413,
    );
    assert.equal((await request(project)).status, 200);
});

test("embeds SVG and PNG images with both href forms and preserves data URLs", () => {
    const svg = global.document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
    );
    for (const file of ["green-flag.svg", "sprites.png"]) {
        const image = global.document.createElementNS(
            svg.namespaceURI,
            "image",
        );
        const filePath = path.join(
            __dirname,
            "../node_modules/scratch-blocks/media",
            file,
        );
        image.setAttribute("href", filePath);
        image.setAttribute("xlink:href", filePath);
        svg.appendChild(image);
    }
    embedImages(svg);
    assert.match(
        svg.children[0].getAttribute("href"),
        /^data:image\/svg\+xml;base64,/,
    );
    const png = svg.children[1].getAttribute("href");
    assert.match(png, /^data:image\/png;base64,/);
    assert.equal(
        Buffer.from(png.split(",")[1], "base64").subarray(1, 4).toString(),
        "PNG",
    );
    for (const image of svg.children)
        assert.equal(
            image.getAttribute("href"),
            image.getAttribute("xlink:href"),
        );
    const before = svg.outerHTML;
    embedImages(svg);
    assert.equal(svg.outerHTML, before);
});

test("measures text and preserves rendering styles across conversions in one worker", async () => {
    const context = global.document.createElement("canvas").getContext("2d");
    const short = context.measureText("move").width;
    assert(short > 0);
    assert(context.measureText("synthetic custom block").width > short);
    for (let i = 0; i < 2; i++) {
        const svgs = await convertToSVG(
            structuredClone(project),
            ["Synthetic Sprite"],
            1,
        );
        assertRendered(svgs["Synthetic Sprite"]);
        assert.match(svgs["Synthetic Sprite"], /fill: rgb\(255, 255, 255\)/);
    }
});
