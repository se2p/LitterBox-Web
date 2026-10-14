// SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

module.exports = (ScratchBlocks) => {
    const colours = {
        motion: ["#4c97ff", "#4280d7", "#3373cc"],
        looks: ["#9966ff", "#855cd6", "#774dcb"],
        sounds: ["#cf63cf", "#c94fc9", "#bd42bd"],
        event: ["#ffbf00", "#e6ac00", "#cc9900"],
        control: ["#ffab19", "#ec9c13", "#cf8b17"],
        sensing: ["#5cb1d6", "#47a8d1", "#2e8eb8"],
        operators: ["#59c059", "#46b946", "#389438"],
        data: ["#ff8c1a", "#ff8000", "#db6e00"],
        data_lists: ["#ff661a", "#ff5500", "#e64d00"],
        more: ["#ff6680", "#ff4d6a", "#ff3355"],
        pen: ["#0fbd8c", "#0da57a", "#0b8e69"],
        textField: ["#ffffff", "#ffffff", "#ffffff"],
    };
    return ScratchBlocks.Theme.defineTheme("screenshot", {
        blockStyles: Object.fromEntries(
            Object.entries(colours).map(([name, palette]) => [
                name,
                {
                    colourPrimary: palette[0],
                    colourSecondary: palette[1],
                    colourTertiary: palette[2],
                },
            ]),
        ),
    });
};
