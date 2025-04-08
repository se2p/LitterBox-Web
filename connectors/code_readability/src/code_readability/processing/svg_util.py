# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import tempfile
from pathlib import Path

from lxml import etree
from PIL import Image
from reportlab.graphics import renderPM
from svglib.svglib import svg2rlg


def parse_svg_tree(svg: str) -> etree.ElementTree:
    parser = etree.HTMLParser()
    svg_tree = etree.fromstring(svg, parser=parser).xpath("//svg")[0]
    return svg_tree


def update_svg_size(
    svg_tree: etree.ElementTree, width: float | None = None, height: float | None = None
) -> etree.ElementTree:
    if width is not None and width > 0:
        svg_tree.set("width", f"{width}px")
    if height is not None and height > 0:
        svg_tree.set("height", f"{height}px")
    return svg_tree


def remove_by_xpath(svg_tree: etree.ElementTree, xpath: str) -> None:
    for bad in svg_tree.xpath(xpath):
        bad.getparent().remove(bad)


def export_image(svg_tree: etree.ElementTree, path: Path) -> None:
    with tempfile.NamedTemporaryFile() as f:
        f.write(etree.tostring(svg_tree))
        f.flush()
        drawing = svg2rlg(f.name)
        renderPM.drawToFile(drawing, path, fmt="PNG")


def export_image2(
    svg_tree: etree.ElementTree, path: Path, size: tuple[int, int] = (128, 128)
) -> None:
    with tempfile.NamedTemporaryFile() as f:
        export_image(svg_tree, Path(f.name))
        im = Image.open(f.name)
        im.thumbnail(size, Image.Resampling.LANCZOS)
        im.save(path, format=path.suffix or "png")
