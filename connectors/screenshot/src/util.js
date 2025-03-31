// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const VM = require('scratch-vm');
const VMScratchBlocks = require('./lib/blocks');
const defineDynamicBlock = require('./lib/define-dynamic-block');

const { window } = new JSDOM('<div id="root"></div>');
const { document, navigator } = window;
global.window = window;
global.document = document;
global.navigator = navigator;
global.DOMParser = window.DOMParser;
FileReader = window.FileReader;

const defaultSVGSize = {
    width: 1920,
    height: 1080,
};
const defaultOptions = {
    media: 'node_modules/scratch-blocks/media/',
    readOnly: true,
    zoom: {
        controls: true,
        wheel: true,
        startScale: 0.5625,
    },
    grid: {
        spacing: 40,
        length: 2,
        colour: '#ddd'
    },
    comments: true,
    collapse: false,
    scrollbars: true,
    sounds: false
};

async function convertToSVG(projectData, sprite, scale) {
    const vm = new VM();
    vm.setCompatibilityMode(true);

    const rootElement = document.getElementById('root');
    const ref = document.createElement('div', {});
    rootElement.appendChild(ref);

    const ScratchBlocks = VMScratchBlocks(vm);
    const workspaceConfig = {
        ...defaultOptions,
        zoom: {
            ...defaultOptions.zoom,
            startScale: scale || defaultOptions.zoom.startScale
        },
    }
    const workspace = ScratchBlocks.inject(ref, workspaceConfig);

    const extensionAddedHandler = handleExtensionAdded(ScratchBlocks);
    vm.addListener('EXTENSION_ADDED', extensionAddedHandler);

    await vm.loadProject(projectData);
    const allTargets = vm.runtime.targets;
    const target = allTargets.find((t) => t.sprite.name.trim() === sprite?.trim());

    return new Promise((resolve, reject) => {
        if (sprite && !target) {
            reject(new Error(`Could not find sprite name ${sprite}`));
        }

        const handler = data => handleWorkspaceUpdate(ScratchBlocks, workspace)(data)
            .then((svgString) => resolve(svgString))
            .catch((err) => reject(err))
            .finally(() => {
                console.log('DISPOSE');
                vm.removeListener('workspaceUpdate', handler);
            });
        vm.addListener('workspaceUpdate', handler);

        if (!target || target.id === vm.editingTarget.id)
            vm.emitWorkspaceUpdate();
        else
            vm.setEditingTarget(target.id);
    })
        .finally(() => {
            vm.removeListener('EXTENSION_ADDED', extensionAddedHandler);
            workspace.dispose();
            rootElement.removeChild(ref);
            // Enforce re-inserting CSS
            document.head.removeChild(document.head.firstElementChild);
            ScratchBlocks.Css.styleSheet_ = null;
        });
}

function applyComputedStylesRecursively(window, element) {
    const computedStyles = window.getComputedStyle(element);

    for (let i = 0; i < computedStyles.length; i++) {
        const styleName = computedStyles[i];
        const styleValue = computedStyles.getPropertyValue(styleName);
        element.style.setProperty(styleName, styleValue);
    }

    for (const child of element.children) {
        applyComputedStylesRecursively(window, child);
    }
}

async function embedXlinkImages(svgElement) {

    const images = svgElement.querySelectorAll('image');

    for (const imgElement of images) {
        const xlinkHref = imgElement.getAttribute('xlink:href');
        if (!xlinkHref || xlinkHref.startsWith('data:image/svg+xml;base64'))
            continue;
        else {
            const svgString = fs.readFileSync(xlinkHref, 'utf8');
            const base64Image = window.btoa(svgString);
            imgElement.setAttribute('xlink:href', `data:image/svg+xml;base64,${base64Image}`);
        }
    }
}

const handleWorkspaceUpdate = (ScratchBlocks, workspace) => async (data) => {
    const dom = ScratchBlocks.Xml.textToDom(data.xml);
    ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
    const svgElement = workspace.getParentSvg();
    svgElement.setAttribute('width', `${defaultSVGSize.width}px`);
    svgElement.setAttribute('height', `${defaultSVGSize.height}px`);
    await embedXlinkImages(svgElement);
    applyComputedStylesRecursively(window, svgElement);
    return svgElement.outerHTML.replaceAll('&nbsp;', ' ');
}

const handleExtensionAdded = (ScratchBlocks) => (categoryInfo) => {
    console.log('EXTENSION_ADDED');
    const defineBlocks = (blockInfoArray) => {
        if (blockInfoArray && blockInfoArray.length > 0) {
            const staticBlocksJson = [];
            const dynamicBlocksInfo = [];
            blockInfoArray.forEach(blockInfo => {
                if (blockInfo.info && blockInfo.info.isDynamic) {
                    dynamicBlocksInfo.push(blockInfo);
                } else if (blockInfo.json) {
                    staticBlocksJson.push(blockInfo.json);
                }
                // otherwise it's a non-block entry such as '---'
            });

            ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
            dynamicBlocksInfo.forEach(blockInfo => {
                // This is creating the block factory / constructor -- NOT a specific instance of the block.
                // The factory should only know static info about the block: the category info and the opcode.
                // Anything else will be picked up from the XML attached to the block instance.
                const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                const blockDefinition =
                    defineDynamicBlock(ScratchBlocks, categoryInfo, blockInfo, extendedOpcode);
                ScratchBlocks.Blocks[extendedOpcode] = blockDefinition;
            });
        }
    };

    // scratch-blocks implements a menu or custom field as a special kind of block ("shadow" block)
    // these actually define blocks and MUST run regardless of the UI state
    defineBlocks(
        Object.getOwnPropertyNames(categoryInfo.customFieldTypes)
            .map(fieldTypeName => categoryInfo.customFieldTypes[fieldTypeName].scratchBlocksDefinition));
    defineBlocks(categoryInfo.menus);
    defineBlocks(categoryInfo.blocks);
};

module.exports = {
    convertToSVG,
}
