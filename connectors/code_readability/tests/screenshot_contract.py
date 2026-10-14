# SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import json
import sys
import unittest
from pathlib import Path

import numpy as np

from code_readability.processing import (
    scratch_colors,
    scratch_svg,
    scratch_towards,
    svg_util,
)


class ScreenshotContract(unittest.TestCase):
    screenshots: dict[str, dict[str, str]]

    @classmethod
    def setUpClass(cls) -> None:
        if set(cls.screenshots) != {"0.5625", "1"}:
            raise ValueError("Expected screenshots at scales 0.5625 and 1")
        for scale, screenshots in cls.screenshots.items():
            if set(screenshots) != {"Synthetic Sprite", "Synthetic Clone"}:
                raise ValueError(f"Expected both synthetic sprites at scale {scale}")

    def test_block_counts_exclude_inputs_and_procedure_prototypes(self) -> None:
        for name, count, script in [
            ("Synthetic Sprite", 7, "start"),
            ("Synthetic Clone", 4, "clone-start"),
        ]:
            for scale, screenshots in self.screenshots.items():
                with self.subTest(sprite=name, scale=scale):
                    tree = svg_util.parse_svg_tree(screenshots[name])
                    _, total, selected = scratch_svg.max_number_of_inside_blocks(tree)
                    self.assertEqual(total, count)
                    self.assertEqual(selected, script)

    def test_svg_scales_match_artifact_labels(self) -> None:
        for scale, screenshots in self.screenshots.items():
            for name, svg in screenshots.items():
                with self.subTest(sprite=name, scale=scale):
                    tree = svg_util.parse_svg_tree(svg)
                    canvas = scratch_svg.Block.get_root_block_element(tree)
                    transform = scratch_svg._read_transform_attr(
                        canvas.attrib["transform"]
                    )
                    self.assertEqual(transform["scale"], float(scale))

    def test_input_recolouring_reaches_rasterized_features(self) -> None:
        for name, colours in [
            ("Synthetic Sprite", [scratch_colors.MOTION_INPUT]),
            (
                "Synthetic Clone",
                [
                    scratch_colors.CONTROL_INPUT,
                    scratch_colors.LOOKS_INPUT,
                    scratch_colors.EXTENSION_COLOR_INPUT,
                ],
            ),
        ]:
            for scale, screenshots in self.screenshots.items():
                image = scratch_towards.take_raw_screenshot(
                    screenshots[name], replace_input_color=True
                )
                for colour in colours:
                    with self.subTest(sprite=name, scale=scale, colour=colour):
                        self.assertGreater(
                            np.count_nonzero(np.all(image == colour[::-1], axis=2)), 0
                        )

    def test_generated_svgs_produce_finite_tensors_and_white_space(self) -> None:
        for scale, screenshots in self.screenshots.items():
            for name, svg in screenshots.items():
                with self.subTest(sprite=name, scale=scale):
                    tensor = scratch_towards.take_screen_shot(svg)
                    self.assertEqual(tensor.shape, (3, 128, 128))
                    self.assertTrue(np.isfinite(tensor).all())
                    self.assertGreaterEqual(tensor.min(), 0)
                    self.assertLessEqual(tensor.max(), 1)
                    raw = scratch_towards.take_raw_screenshot(svg)
                    self.assertEqual(raw.shape[0], raw.shape[1])
                    self.assertEqual(raw.shape[2], 3)
                    self.assertGreater(raw.shape[0], 128)
                    self.assertGreater(
                        np.count_nonzero(np.all(raw == scratch_colors.SPACE, axis=2)),
                        raw.shape[0] * raw.shape[1] / 4,
                    )


if __name__ == "__main__":
    screenshots_path = sys.argv.pop(1)
    ScreenshotContract.screenshots = json.loads(Path(screenshots_path).read_text())
    unittest.main()
