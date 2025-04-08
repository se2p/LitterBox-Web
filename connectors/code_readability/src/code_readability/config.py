# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_path: str
