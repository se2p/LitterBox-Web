# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import asyncio
import logging

from fastapi import FastAPI
from litterbox_web_api.code_completion import (
    CodeCompletionRequest,
    CodeCompletionResponse,
    CodeCompletionPrediction,
)


class Model:
    lock: asyncio.Lock

    def __init__(self) -> None:
        self.lock = asyncio.Lock()

    async def code_completion(
        self, request: CodeCompletionRequest
    ) -> CodeCompletionResponse:
        log.info("Code completion request: %s", request)

        # lock: PyTorch models might only be able to handle a single forward pass at
        # the same time, this ensures that there is no concurrent access to the same
        # underlying model
        async with self.lock:
            prediction = CodeCompletionPrediction(
                token="event_greenflag", confidence=0.24
            )
            return CodeCompletionResponse(predictions=[prediction] * request.top_k)


app = FastAPI()
log = logging.getLogger("uvicorn")
model = Model()


@app.post("/code-completion")
async def code_completion(request: CodeCompletionRequest) -> CodeCompletionResponse:
    return await model.code_completion(request)
