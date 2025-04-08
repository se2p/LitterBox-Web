# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends

from code_readability.config import Settings
from code_readability.model.towards_model import (
    TowardsModel,
    load_roberta_towards_model,
)
from code_readability.service import ReadabilityService


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore [call-arg]


async def get_roberta_towards_model(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TowardsModel:
    model = load_roberta_towards_model(Path(settings.model_path))
    model.eval()
    return model


async def get_readability_service(
    model: Annotated[TowardsModel, Depends(get_roberta_towards_model)],
) -> ReadabilityService:
    return ReadabilityService(model)
