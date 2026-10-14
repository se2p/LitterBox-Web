// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

const block = (opcode, parent, next, inputs = {}, extra = {}) => ({
    opcode,
    parent,
    next,
    inputs,
    fields: {},
    shadow: false,
    topLevel: parent === null,
    ...(parent === null ? { x: 20, y: 20 } : {}),
    ...extra,
});
const procedure = {
    tagName: "mutation",
    children: [],
    proccode: "synthetic custom",
    argumentids: "[]",
    argumentnames: "[]",
    argumentdefaults: "[]",
    warp: "false",
};
const target = (name, blocks, isStage = false) => ({
    name,
    isStage,
    blocks,
    variables: {},
    lists: {},
    broadcasts: {},
    comments: {},
    currentCostume: 0,
    costumes: [
        {
            name: "Synthetic costume",
            assetId: "00000000000000000000000000000000",
            md5ext: "00000000000000000000000000000000.svg",
            dataFormat: "svg",
            rotationCenterX: 0,
            rotationCenterY: 0,
        },
    ],
    sounds: [],
    volume: 100,
    layerOrder: isStage ? 0 : 1,
    ...(isStage
        ? {
              tempo: 60,
              videoTransparency: 50,
              videoState: "on",
              textToSpeechLanguage: null,
          }
        : {
              visible: true,
              x: 0,
              y: 0,
              size: 100,
              direction: 90,
              draggable: false,
              rotationStyle: "all around",
          }),
});

module.exports = {
    targets: [
        target("Stage", {}, true),
        target("Synthetic Sprite", {
            start: block("event_whenflagclicked", null, "move"),
            move: block("motion_movesteps", "start", "sound", {
                STEPS: [1, [4, "10"]],
            }),
            sound: block("sound_play", "move", "pen", {
                SOUND_MENU: [1, "sound-menu"],
            }),
            "sound-menu": block(
                "sound_sounds_menu",
                "sound",
                null,
                {},
                {
                    fields: { SOUND_MENU: ["synthetic sound", null] },
                    shadow: true,
                },
            ),
            pen: block("pen_clear", "sound", "call"),
            call: block(
                "procedures_call",
                "pen",
                null,
                {},
                { mutation: procedure },
            ),
            definition: block(
                "procedures_definition",
                null,
                "turn",
                { custom_block: [1, "prototype"] },
                { x: 300 },
            ),
            prototype: block(
                "procedures_prototype",
                "definition",
                null,
                {},
                { shadow: true, mutation: procedure },
            ),
            turn: block("motion_turnright", "definition", null, {
                DEGREES: [1, [4, "15"]],
            }),
        }),
        target("Synthetic Clone", {
            "clone-start": block("event_whenflagclicked", null, "clone-repeat"),
            "clone-repeat": block("control_repeat", "clone-start", null, {
                TIMES: [1, [6, "2"]],
                SUBSTACK: [2, "clone-say"],
            }),
            "clone-say": block("looks_say", "clone-repeat", "clone-colour", {
                MESSAGE: [1, [10, "second sprite only"]],
            }),
            "clone-colour": block("pen_setPenColorToColor", "clone-say", null, {
                COLOR: [1, [9, "#123456"]],
            }),
        }),
    ],
    monitors: [],
    extensions: ["pen"],
    meta: { semver: "3.0.0", vm: "5.0.300", agent: "synthetic verification" },
};
