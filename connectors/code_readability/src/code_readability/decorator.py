# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from typing import Any, Callable


def register(registry: dict[str, Any], name: str) -> Callable[[Callable], Callable]:
    def decorator(func_or_class: Callable) -> Callable:
        if name in registry:
            raise ValueError(f"'{name}' is already registered")
        registry[name] = func_or_class
        return func_or_class

    return decorator
