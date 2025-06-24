# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from pydantic import BaseModel, constr


class VisualFeature(BaseModel):
    svg: constr(pattern="^<svg.*</svg>$", strict=True)  # type: ignore[valid-type]


class CodeReadabilityRequest(VisualFeature):
    tokens: list[list[str]]
    scratchblocks: str


class CodeReadabilityResponse(BaseModel):
    readable: bool
    confidence: float
