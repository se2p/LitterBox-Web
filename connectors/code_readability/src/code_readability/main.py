# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import asyncio
import logging
import sys
from typing import Annotated

import uvicorn
from fastapi import Depends, FastAPI
from litterbox_web_api.code_readability import (
    CodeReadabilityRequest,
    CodeReadabilityResponse,
    VisualFeature,
)

from code_readability.dependencies import get_readability_service
from code_readability.service import ReadabilityService


class Model:
    lock: asyncio.Lock

    def __init__(self) -> None:
        self.lock = asyncio.Lock()

    async def code_readability(
        self,
        request: CodeReadabilityRequest,
        readability_service: ReadabilityService,
    ) -> CodeReadabilityResponse:
        log.info("Code readability request: %s", request)

        # lock: PyTorch models might only be able to handle a single forward pass at
        # the same time, this ensures that there is no concurrent access to the same
        # underlying model
        async with self.lock:
            return readability_service.compute_readability(request)


app = FastAPI()
log = logging.getLogger("uvicorn")
model = Model()


@app.post("/code-readability", response_model=CodeReadabilityResponse)
async def code_readability(
    request: CodeReadabilityRequest,
    readability_service: Annotated[
        ReadabilityService, Depends(get_readability_service)
    ],
) -> CodeReadabilityResponse:
    return await model.code_readability(request, readability_service)


@app.post("/dorn-metrics", response_model=dict[str, float])
async def dorn_metrics(
    request: VisualFeature,
    readability_service: Annotated[
        ReadabilityService, Depends(get_readability_service)
    ],
) -> dict[str, float]:
    return readability_service.compute_dorn_metrics(request)


def main(argv: list[str] | None = None) -> None:
    if argv is None:
        argv = sys.argv

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
