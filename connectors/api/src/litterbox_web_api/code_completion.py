# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from pydantic import BaseModel


class CodeCompletionRequest(BaseModel):
    tokens: str
    mask_token: str
    top_k: int


class CodeCompletionPrediction(BaseModel):
    token: str
    confidence: float


class CodeCompletionResponse(BaseModel):
    predictions: list[CodeCompletionPrediction]
