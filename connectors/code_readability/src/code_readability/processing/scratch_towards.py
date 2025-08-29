# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from litterbox_web_api.code_readability import CodeReadabilityRequest
from lxml import etree

from code_readability.processing import oalmbbp, scratch_colors, scratch_svg, svg_util


def to_towards_sample(
    request: CodeReadabilityRequest,
    sep_token: str = "[EOS]",
    frame_size: tuple[int, int] = (478, 478),
    img_size: tuple[int, int] = (128, 128),
    structural_matrix_size: tuple[int, int] = (30, 110),
) -> dict[str, Any]:
    sentence = oalmbbp.get_sentence_for_roberta(request.tokens, sep_token)
    image = take_screen_shot(
        request.svg,
        size=frame_size,
        img_size=img_size,
    )
    structural_matrix = to_structural_matrix(
        request.scratchblocks,
        max_rows=structural_matrix_size[0],
        max_cols=structural_matrix_size[1],
    )

    return {
        "visual": image,
        "semantic": sentence,
        "structural": structural_matrix,
    }


def to_structural_matrix(
    scratchblocks: str, max_rows: int = 50, max_cols: int = 350
) -> np.ndarray:
    """
    Converts scratchblocks code to structural representation.
    :param scratchblocks: scripts content in scratchblocks format.
    :param max_rows: Maximum number of rows.
    :param max_cols: Maximum number of columns.
    :return: Structural representation.
    """
    # Initialize an empty 2D character matrix with values -1
    character_matrix = np.full((max_rows, max_cols), -1, dtype=np.float32)

    # Convert Java code to ASCII values and populate the character matrix
    lines = scratchblocks.splitlines(keepends=True)
    for row, line in enumerate(lines):
        for col, char in enumerate(line):
            if row < max_rows and col < max_cols:
                character_matrix[row, col] = ord(char)

    return character_matrix


def _read_image(image_path: str) -> np.ndarray:
    """
    Opens a png image as rgb tensor. Removes the alpha channel and transforms the values
    to float32. The shape of the tensor is (height, width, 3).
    :param image_path: The path to the image
    :return: The image ndarray
    """
    img = cv2.imread(image_path)

    assert img is not None, f"Image is None: {image_path}"

    # Remove the alpha channel
    img_array = img[:, :, :3]

    return img_array


def align_view_for_best_screen_shot(
    svg_tree: etree.ElementTree,
    size: tuple[int, int] = (478, 478),
) -> etree.ElementTree:
    # Align svg view to top-left of a script in which the number of captured blocks is the biggest
    max_no_inside_blocks, total, align_to_script = (
        scratch_svg.max_number_of_inside_blocks(svg_tree)
    )
    svg_util.update_svg_size(svg_tree, width=size[0], height=size[1])
    scratch_svg.align_view_to_script(svg_tree, align_to_script)
    return svg_tree


def take_screen_shot(
    svg: str,
    size: tuple[int, int] = (478, 478),
    img_size: tuple[int, int] = (128, 128),
) -> np.ndarray:
    svg_tree = svg_util.parse_svg_tree(svg)

    # Align svg view to top-left of a script in which the number of captured blocks is the biggest
    svg_tree = align_view_for_best_screen_shot(svg_tree, size=size)

    # Remove text and icons
    svg_util.remove_by_xpath(svg_tree, "//text")
    svg_util.remove_by_xpath(svg_tree, "//image")

    with tempfile.NamedTemporaryFile() as f:
        svg_util.export_image2(svg_tree, Path(f.name), size=img_size)
        img_array = _read_image(f.name)
        # Transpose the array to get the shape (3, height, width)
        return np.transpose(img_array, (2, 0, 1)) / 255


def take_raw_screenshot(
    svg: str,
    size: tuple[int, int] = (478, 478),
    replace_input_color: bool = False,
) -> np.ndarray:
    svg_tree = svg_util.parse_svg_tree(svg)

    # Align svg view to top-left of a script in which the number of captured blocks is the biggest
    svg_tree = align_view_for_best_screen_shot(svg_tree, size=size)

    if replace_input_color:
        _replace_input_color(svg_tree)

    # Remove text and icons
    svg_util.remove_by_xpath(svg_tree, "//text")
    svg_util.remove_by_xpath(svg_tree, "//image")

    with tempfile.NamedTemporaryFile() as f:
        svg_util.export_image(svg_tree, Path(f.name))
        return _read_image(f.name)


def _replace_input_color(svg_tree: Any) -> None:
    type_condition = " or ".join(
        [f'@data-argument-type="{c}"' for c in ["colour", "text", "text number"]]
    )
    for path_element in svg_tree.xpath(
        f"//g[@data-shapes = $shape and ({type_condition})]/path",
        shape="argument round",
    ):
        parent = path_element.getparent()
        data_argument_type = parent.attrib["data-argument-type"]
        data_argument_type = (
            "color_input" if data_argument_type == "colour" else "input"
        )

        grand_parent = parent.getparent()
        data_category = grand_parent.attrib.get("data-category", "custom")

        input_key = f"{data_category}_{data_argument_type}"
        if input_key not in _INPUT_BLOCK_COLOR_MAPPING:
            # Extension case
            input_key = f"extension_{data_argument_type}"

        path_element.attrib["fill"] = scratch_colors.rgb_to_hex(
            _INPUT_BLOCK_COLOR_MAPPING[input_key]
        )


_INPUT_BLOCK_COLOR_MAPPING = {
    "motion_input": scratch_colors.MOTION_INPUT,
    "looks_input": scratch_colors.LOOKS_INPUT,
    "sounds_input": scratch_colors.SOUND_INPUT,
    "events_input": scratch_colors.EVENT_INPUT,
    "operators_input": scratch_colors.OPERATOR_INPUT,
    "control_input": scratch_colors.CONTROL_INPUT,
    "sensing_input": scratch_colors.SENSING_INPUT,
    "sensing_color_input": scratch_colors.SENSING_COLOR_INPUT,
    "data_input": scratch_colors.VARIABLE_INPUT,
    "custom_input": scratch_colors.CUSTOM_INPUT,
    "extension_input": scratch_colors.EXTENSION_INPUT,
    "extension_color_input": scratch_colors.EXTENSION_COLOR_INPUT,
}
