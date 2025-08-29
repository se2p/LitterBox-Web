# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import json
from pathlib import Path

from fastapi.testclient import TestClient

from code_readability.main import app

client = TestClient(app)
readable_sprite = json.loads(
    (Path(__file__).parent / "resources" / "readable.json").read_text(encoding="utf-8")
)
unreadable_sprite = json.loads(
    (Path(__file__).parent / "resources" / "unreadable.json").read_text(
        encoding="utf-8"
    )
)


def test_code_readability_readable() -> None:
    response = client.post(
        "/code-readability",
        json=readable_sprite,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["readable"] is True, "Should be a readable sprite"
    assert result["confidence"] > 0.0


def test_code_readability_unreadable() -> None:
    response = client.post(
        "/code-readability",
        json=unreadable_sprite,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["readable"] is False, "Should be an unreadable sprite"
    assert result["confidence"] > 0.0


def test_code_readability_invalid_body() -> None:
    invalid_svg = readable_sprite.copy()
    invalid_svg["svg"] = "blah blah blah"
    response = client.post(
        "/code-readability",
        json=invalid_svg,
    )
    assert response.status_code == 422

    missing_field = readable_sprite.copy()
    del missing_field["tokens"]
    response = client.post(
        "/code-readability",
        json=missing_field,
    )
    assert response.status_code == 422


def test_dorn_metrics_readable() -> None:
    response = client.post(
        "/dorn-metrics",
        json={"svg": readable_sprite["svg"]},
    )
    assert response.status_code == 200
    result = response.json()
    print(result)

    colors = [
        "LOOKSs",
        "EVENTs",
        "CONTROLs",
        "SENSINGs",
        "BLOCKs",
        "SELECTs",
        "PLACEHOLDERs",
    ]
    for i in range(0, len(colors)):
        assert result[f"Dorn Areas {colors[i]}"] > 0, (
            f"Dorn Areas {colors[i]} must be greater than 0"
        )
        if i == len(colors) - 1:
            break
        for j in range(i + 1, len(colors)):
            assert result[f"Dorn Areas {colors[i]} / {colors[j]}"] > 0, (
                f"Dorn Areas {colors[i]} / {colors[j]} must be greater than 0"
            )
