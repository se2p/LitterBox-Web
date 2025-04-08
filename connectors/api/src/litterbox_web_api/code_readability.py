# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from pydantic import BaseModel, constr


class CodeReadabilityRequest(BaseModel):
    tokens: list[list[str]]
    svg: constr(pattern="^<svg.*</svg>$", strict=True)  # type: ignore[valid-type]
    scratchblocks: str


class CodeReadabilityResponse(BaseModel):
    readable: bool
    confidence: float
