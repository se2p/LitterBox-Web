# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import json
from typing import Optional, Callable, Dict

import math
from lxml import etree
from svgpathtools import parse_path


class BBox:
    def __init__(self, x_min, x_max, y_min, y_max):
        self.x_min = x_min
        self.x_max = x_max
        self.y_min = y_min
        self.y_max = y_max

    @property
    def width(self) -> float:
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        return self.y_max - self.y_min

    @property
    def area(self) -> float:
        return self.width * self.height

    def scale(self, factor: float):
        self.x_min *= factor
        self.x_max *= factor
        self.y_min *= factor
        self.y_max *= factor

    def translate(self, x, y):
        self.x_min += x
        self.x_max += x
        self.y_min += y
        self.y_max += y

    def overlaps(self, other: "BBox") -> Optional["BBox"]:
        overlap = BBox(
            max(self.x_min, other.x_min),
            min(self.x_max, other.x_max),
            max(self.y_min, other.y_min),
            min(self.y_max, other.y_max),
        )
        if overlap.width > 0 and overlap.height > 0:
            return overlap
        return None

    def is_covered_by(self, cover_ratio: float, other: "BBox") -> bool:
        overlap = self.overlaps(other)
        return overlap.area > cover_ratio * self.area if overlap is not None else False

    def count_inside_bboxes(self, cover_ratio: float, bboxes: list["BBox"]) -> int:
        covered_bboxes = [bbox for bbox in bboxes if bbox.is_covered_by(cover_ratio, self)]
        return len(covered_bboxes)

    def __repr__(self):
        return json.dumps({
            "x_min": self.x_min,
            "x_max": self.x_max,
            "y_min": self.y_min,
            "y_max": self.y_max,
        })


class Block:
    def __init__(self, block_id: str, op_code: str, bbox: BBox, parent: Optional["Block"] = None):
        self.block_id = block_id
        self.op_code = op_code
        self.bbox = bbox
        self.parent = parent
        self.children = []

    def add_child(self, child: "Block"):
        self.children.append(child)

    def traverse(self):
        yield self
        for child in self.children:
            yield from child.traverse()

    def __repr__(self):
        return f"<Block {self.__dict__}>"

    @staticmethod
    def get_root_block_element(svg_tree: etree.ElementTree):
        return svg_tree.xpath('//g[@class="blocklyBlockCanvas"]')[0]

    @classmethod
    def from_svg_tree(
        cls,
        svg_tree: etree.ElementTree,
        op_code_mapping: Optional[Callable[[str], str]],
    ) -> "Block":
        root_block_element = cls.get_root_block_element(svg_tree)
        root_block = Block(
            block_id="root",
            op_code="root",
            bbox=BBox(-1, -1, -1, -1),
        )

        for block_element in root_block_element.iterchildren():
            block = cls.from_block_element(
                block_element,
                {"x": 0., "y": 0.},
                op_code_mapping=op_code_mapping,
            )
            if block is None:
                continue
            root_block.add_child(block)

        return root_block

    @classmethod
    def from_block_element(
        cls,
        element: etree.Element,
        parent_position: dict[str, float],
        op_code_mapping: Optional[Callable[[str], str]],
        parent: Optional["Block"] = None,
    ) -> Optional["Block"]:
        path_elements = element.xpath("./path")
        if ("data-id" not in element.attrib
            or "data-argument-type" in element.attrib
            or len(path_elements) == 0):
            return None
        parsed_path = parse_path(path_elements[0].attrib["d"])
        position = _read_transform_attr(element.attrib["transform"])
        position["x"] += parent_position["x"]
        position["y"] += parent_position["y"]
        bbox = BBox(*parsed_path.bbox())
        bbox.translate(position["x"], position["y"])

        block = Block(
            block_id=element.attrib["data-id"],
            op_code=op_code_mapping(element.attrib["data-id"]) if op_code_mapping else None,
            bbox=bbox,
            parent=parent,
        )
        for block_element in element.iterchildren():
            child_block = cls.from_block_element(
                block_element, position,
                parent=block,
                op_code_mapping=op_code_mapping,
            )
            if child_block is None:
                continue
            block.add_child(child_block)

        return block


def _read_transform_attr(transform_attr: str) -> Optional[Dict[str, float]]:
    functions = transform_attr.split()
    res = {}
    for func in functions:
        if func.startswith("translate(") and func[-1] == ")":
            x, y = [float(v) for v in func[10: -1].split(",")]
            res.update({
                "x": x,
                "y": y,
            })
        elif func.startswith("scale(") and func[-1] == ")":
            res["scale"] = float(func[6:-1])
    return res


def max_number_of_inside_blocks(
    svg_tree: etree.ElementTree,
    width: float = 478.,
    height: float = 478.,
    cover_ratio: float = 0.9,
) -> tuple[int, int, str]:
    root_block = Block.from_svg_tree(svg_tree, None)
    root_block_element = Block.get_root_block_element(svg_tree)
    root_block_position = _read_transform_attr(root_block_element.attrib["transform"])
    scale = root_block_position["scale"]

    scripts: list[list[Block]] = [[b for b in s.traverse()] for s in root_block.children]
    if len(scripts) == 0:
        print("No scripts found")
        return -1, -1, ""

    sprite_bboxes: list[BBox] = [b.bbox for s in scripts for b in s]
    max_count = -1
    max_index = -1
    for i, script in enumerate(scripts):
        print(f"Align to top-left of {script[0].block_id}")
        screenshot_bbox = BBox(
            x_min=script[0].bbox.x_min,
            x_max=script[0].bbox.x_min + (width / scale),
            y_min=script[0].bbox.y_min,
            y_max=script[0].bbox.y_min + (height / scale),
        )
        count = screenshot_bbox.count_inside_bboxes(cover_ratio=cover_ratio, bboxes=sprite_bboxes)
        if count > max_count:
            max_index = i
            max_count = count
        print(f"Number of blocks undercover: {count}")
        print(f"Proportion: {count / len(sprite_bboxes)}")

    return max_count, len(sprite_bboxes), scripts[max_index][0].block_id


def _calculate_coord_to_align_tl(min_val, scale):
    if math.isclose(min_val, 0.):
        return 0.
    return - min_val * scale


def align_view_to_script(svg_tree, script_id):
    root_block_element = Block.get_root_block_element(svg_tree)
    root_block_position = _read_transform_attr(root_block_element.attrib["transform"])
    scale = root_block_position["scale"]

    script_element = None
    for block_element in root_block_element.iterchildren():
        if block_element.attrib["data-id"] == script_id:
            script_element = block_element
            break
    if script_element is None:
        raise ValueError("Script element not found in SVG tree")
    script_position = _read_transform_attr(script_element.attrib["transform"])
    path_elements = script_element.xpath("./path")
    parsed_path = parse_path(path_elements[0].attrib["d"])
    xtl, _, ytl, _ = parsed_path.bbox()
    xtl += script_position["x"]
    ytl += script_position["y"]
    new_x = _calculate_coord_to_align_tl(xtl, scale)
    new_y = _calculate_coord_to_align_tl(ytl, scale)

    root_block_element.attrib["transform"] = f"translate({new_x},{new_y}) scale({scale})"
