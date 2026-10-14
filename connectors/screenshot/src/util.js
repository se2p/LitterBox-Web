// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const { JSDOM } = require("jsdom");
const VM = require("scratch-vm");
const FakeAudioContext = require("./audio-context");
const VMScratchBlocks = require("./lib/blocks");
const defineDynamicBlock = require("./lib/define-dynamic-block");
const createTheme = require("./theme");
const installCanvas = require("./canvas");
const { serializeWorkspace } = require("./svg");

const { window } = new JSDOM('<div id="root"></div>', {
    pretendToBeVisual: true,
});
const { document, navigator } = window;
installCanvas(window);
window.AudioContext ??= FakeAudioContext;
window.webkitAudioContext ??= FakeAudioContext;
global.AudioContext = window.AudioContext;
global.webkitAudioContext = window.webkitAudioContext;
global.window = window;
global.document = document;
global.navigator = navigator;
global.DOMParser = window.DOMParser;
global.NodeList = window.NodeList;
global.Element = window.Element;
global.FileReader = window.FileReader;
global.XMLSerializer = window.XMLSerializer;
global.HTMLElement = window.HTMLElement;
global.SVGElement = window.SVGElement;

// Need to be placed here after global elements were all set.
const AudioEngine = require("scratch-audio");

const defaultOptions = {
    media: __dirname + "/../node_modules/scratch-blocks/media/",
    readOnly: true,
    zoom: {
        controls: false,
        startScale: 0.5625,
    },
    comments: true,
    collapse: false,
    scrollbars: false,
    sounds: false,
};

function normaliseSpriteName(renderedTargetOrName) {
    if (typeof renderedTargetOrName !== "string") {
        renderedTargetOrName = renderedTargetOrName.sprite.name;
    }

    return renderedTargetOrName.normalize("NFC");
}

async function convertToSVG(projectData, spriteNames, scale) {
    spriteNames = (spriteNames || []).map((name) => normaliseSpriteName(name));

    const vm = new VM();
    vm.setCompatibilityMode(true);
    vm.attachAudioEngine(new AudioEngine());

    const rootElement = document.getElementById("root");
    const ref = document.createElement("div", {});
    rootElement.appendChild(ref);

    const ScratchBlocks = VMScratchBlocks(vm);
    const workspaceConfig = {
        ...defaultOptions,
        theme: createTheme(ScratchBlocks),
        zoom: {
            ...defaultOptions.zoom,
            startScale: scale || defaultOptions.zoom.startScale,
        },
    };
    const workspace = ScratchBlocks.inject(ref, workspaceConfig);
    const extractSvg = handleWorkspaceUpdate(ScratchBlocks, workspace);
    const extensionAddedHandler = handleExtensionAdded(
        ScratchBlocks,
        workspace,
    );
    vm.addListener("EXTENSION_ADDED", extensionAddedHandler);

    try {
        await vm.loadProject(projectData);

        const allSprites = vm.runtime.targets.map((sprite) => [
            normaliseSpriteName(sprite),
            sprite,
        ]);
        const sprites =
            spriteNames.length === 0
                ? allSprites
                : allSprites.filter(([name]) => spriteNames.includes(name));

        const svgs = {};
        for (const [name, sprite] of sprites) {
            const svgPromise = new Promise((resolve, reject) => {
                vm.once("workspaceUpdate", (data) =>
                    extractSvg(data)
                        .then((svg) => resolve(svg))
                        .catch((err) => reject(err)),
                );
            });

            if (!sprite || sprite.id === vm.editingTarget.id) {
                vm.emitWorkspaceUpdate();
            } else {
                vm.setEditingTarget(sprite.id);
            }

            svgs[name] = await svgPromise;
        }

        return svgs;
    } finally {
        vm.removeListener("EXTENSION_ADDED", extensionAddedHandler);
        rootElement.removeChild(ref);
        try {
            workspace.dispose();
        } catch {
            // This happens when there was workspace update error.
            // However, it's still safe to ignore this error.
        }
        vm.quit();
    }
}

const handleWorkspaceUpdate = (ScratchBlocks, workspace) => async (data) => {
    const dom = ScratchBlocks.utils.xml.textToDom(data.xml);
    try {
        ScratchBlocks.clearWorkspaceAndLoadFromXml(dom, workspace);
        await ScratchBlocks.renderManagement.finishQueuedRenders();
    } catch (error) {
        if (error.message) {
            error.message = `Workspace Update Error: ${error.message}`;
        }
        throw error;
    }
    return serializeWorkspace(ScratchBlocks, workspace);
};

const handleExtensionAdded = (ScratchBlocks, workspace) => (categoryInfo) => {
    const theme = workspace.getTheme();
    const previousStyle = theme.blockStyles[categoryInfo.id];
    theme.setBlockStyle(categoryInfo.id, {
        colourPrimary: categoryInfo.color1,
        colourSecondary:
            categoryInfo.color2 ??
            previousStyle?.colourSecondary ??
            categoryInfo.color1,
        colourTertiary:
            categoryInfo.color3 ??
            previousStyle?.colourTertiary ??
            categoryInfo.color1,
    });
    workspace.setTheme(theme);
    const defineBlocks = (blockInfoArray) => {
        if (blockInfoArray && blockInfoArray.length > 0) {
            const staticBlocksJson = [];
            const dynamicBlocksInfo = [];
            blockInfoArray.forEach((blockInfo) => {
                if (blockInfo.info && blockInfo.info.isDynamic) {
                    dynamicBlocksInfo.push(blockInfo);
                } else if (blockInfo.json) {
                    const json = { ...blockInfo.json, style: categoryInfo.id };
                    for (const key of [
                        "colour",
                        "colourSecondary",
                        "colourTertiary",
                        "colourQuaternary",
                    ]) {
                        delete json[key];
                    }
                    staticBlocksJson.push(json);
                }
                // otherwise it's a non-block entry such as '---'
            });

            ScratchBlocks.common.defineBlocksWithJsonArray(staticBlocksJson);
            dynamicBlocksInfo.forEach((blockInfo) => {
                // This is creating the block factory / constructor -- NOT a specific instance of the block.
                // The factory should only know static info about the block: the category info and the opcode.
                // Anything else will be picked up from the XML attached to the block instance.
                const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                const blockDefinition = defineDynamicBlock(
                    ScratchBlocks,
                    categoryInfo,
                    blockInfo,
                    extendedOpcode,
                );
                ScratchBlocks.Blocks[extendedOpcode] = blockDefinition;
            });
        }
    };

    // scratch-blocks implements a menu or custom field as a special kind of block ("shadow" block)
    // these actually define blocks and MUST run regardless of the UI state
    defineBlocks(
        Object.getOwnPropertyNames(categoryInfo.customFieldTypes).map(
            (fieldTypeName) =>
                categoryInfo.customFieldTypes[fieldTypeName]
                    .scratchBlocksDefinition,
        ),
    );
    defineBlocks(categoryInfo.menus);
    defineBlocks(categoryInfo.blocks);
};

module.exports = {
    convertToSVG,
};
