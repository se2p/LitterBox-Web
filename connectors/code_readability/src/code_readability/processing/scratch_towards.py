# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from code_readability.processing import svg_util, oalmbbp, scratch_svg
from litterbox_web_api.code_readability import CodeReadabilityRequest


def to_towards_sample(
    request: CodeReadabilityRequest,
    sep_token: str = '[EOS]',
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
        'visual': image,
        'semantic': sentence,
        'structural': structural_matrix,
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
    to float32. The shape of the tensor is (3, height, width).
    :param image_path: The path to the image
    :return: The image ndarray
    """
    img = cv2.imread(image_path)

    assert img is not None, f'Image is None: {image_path}'

    # Remove the alpha channel
    img_array = img[:, :, :3]

    # Transpose the array to get the shape (3, height, width)
    img_array = np.transpose(img_array, (2, 0, 1)) / 255

    # Convert NumPy array to tensor
    return img_array


def take_screen_shot(
    svg: str,
    size: tuple[int, int] = (478, 478),
    img_size: tuple[int, int] = (128, 128),
):
    svg_tree = svg_util.parse_svg_tree(svg)

    # Align svg view to top-left of a script in which the number of captured blocks is the biggest
    max_no_inside_blocks, total, align_to_script = scratch_svg.max_number_of_inside_blocks(svg_tree)
    svg_util.update_svg_size(svg_tree, width=size[0], height=size[1])
    scratch_svg.align_view_to_script(svg_tree, align_to_script)

    # Remove text and icons
    svg_util.remove_by_xpath(svg_tree, '//text')
    svg_util.remove_by_xpath(svg_tree, '//image')

    with tempfile.NamedTemporaryFile() as f:
        svg_util.export_image2(svg_tree, Path(f.name), size=img_size)
        return _read_image(f.name)
