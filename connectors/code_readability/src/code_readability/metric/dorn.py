# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import math
from abc import abstractmethod
from typing import Callable

import numpy as np
from numpy import fft

from code_readability.decorator import register
from code_readability.processing import scratch_colors

DORN_METRICS: dict[str, "DornMetric"] = {}


def get_all_metrics() -> list["DornMetric"]:
    metrics = []
    for metric in DORN_METRICS.values():
        metrics += metric.get_all_variants()
    return metrics


class DornMetric:
    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError()

    @abstractmethod
    def compute(self, color_matrix: np.ndarray) -> float:
        raise NotImplementedError()

    @classmethod
    @abstractmethod
    def get_all_variants(cls) -> list["DornMetric"]:
        raise NotImplementedError()


@register(DORN_METRICS, "Dorn_ColorsAreas")
class ColorsAreas(DornMetric):
    def __init__(self, kind: str):
        assert kind in scratch_colors.BLOCKS, (
            f"kind must be in {scratch_colors.BLOCKS}, but {kind}"
        )
        self.block_color = scratch_colors.BLOCK_COLOR_MAPPING[kind]

    @property
    def name(self) -> str:
        return f"Dorn Areas {scratch_colors.COLOR_BLOCK_MAPPING[self.block_color]}s"

    def compute(self, color_matrix: np.ndarray) -> float:
        total = 0
        total_color = 0
        for i in range(len(color_matrix)):
            first = False
            for j in range(len(color_matrix[i]) - 1, -1, -1):
                rgb = _brg_to_rgb(color_matrix[i][j])
                if rgb != scratch_colors.SPACE or first:
                    first = True
                    total += 1
                    if rgb == self.block_color:
                        total_color += 1

        return float(total_color) / total if total > 0 else 0.0

    @classmethod
    def get_all_variants(cls) -> list["DornMetric"]:
        return [ColorsAreas(kind) for kind in scratch_colors.BLOCKS]


@register(DORN_METRICS, "Dorn_ColorsMutualAreas")
class ColorsMutualAreas(DornMetric):
    def __init__(self, kind1: str, kind2: str):
        assert kind1 in scratch_colors.BLOCKS, (
            f"block_name1 must be in {scratch_colors.BLOCKS}, but {kind1}"
        )
        assert kind2 in scratch_colors.BLOCKS, (
            f"block_name2 must be in {scratch_colors.BLOCKS}, but {kind2}"
        )
        assert kind1 != kind2, (
            f"Expect block_name1 != block_name2, but '{kind1}' == '{kind2}'"
        )
        self.block_color1 = scratch_colors.BLOCK_COLOR_MAPPING[kind1]
        self.block_color2 = scratch_colors.BLOCK_COLOR_MAPPING[kind2]

    @property
    def name(self) -> str:
        return (
            f"Dorn Areas {scratch_colors.COLOR_BLOCK_MAPPING[self.block_color1]}s "
            f"/ {scratch_colors.COLOR_BLOCK_MAPPING[self.block_color2]}s"
        )

    def compute(self, color_matrix: np.ndarray) -> float:
        total_color1 = 0
        total_color2 = 0
        for i in range(len(color_matrix)):
            first = False
            for j in range(len(color_matrix[i]) - 1, -1, -1):
                rgb = _brg_to_rgb(color_matrix[i][j])
                if rgb != scratch_colors.SPACE or first:
                    first = True
                    if rgb == self.block_color1:
                        total_color1 += 1
                    if rgb == self.block_color2:
                        total_color2 += 1

        return float(total_color1) / total_color2 if total_color2 > 0 else 0.0

    @classmethod
    def get_all_variants(cls) -> list["DornMetric"]:
        return [
            ColorsMutualAreas(scratch_colors.BLOCKS[i], scratch_colors.BLOCKS[j])
            for i in range(len(scratch_colors.BLOCKS) - 1)
            for j in range(i + 1, len(scratch_colors.BLOCKS))
        ]


@register(DORN_METRICS, "Dorn_DFTBandwidth")
class DFTBandwidth(DornMetric):
    def __init__(self, kind: str):
        assert kind == "SPACE" or kind in scratch_colors.BLOCKS, (
            f"kind must be in {scratch_colors.BLOCKS + ['SPACE']}, but {kind}"
        )
        self.kind = kind
        self.block_color = getattr(scratch_colors, kind)

    @property
    def name(self) -> str:
        return f"Dorn DFT {self.kind}"

    def compute(self, color_matrix: np.ndarray) -> float:
        amplitudes = self.get_dft_amplitudes(self.get_features(color_matrix))
        return self.calculate_bandwidth(amplitudes) + 1

    @classmethod
    def get_all_variants(cls) -> list["DornMetric"]:
        return [DFTBandwidth(kind) for kind in (scratch_colors.BLOCKS + ["SPACE"])]

    @staticmethod
    def calculate_bandwidth(vector: list[float]) -> float:
        std_value = np.std(vector)
        for i in range(len(vector) - 1, -1, -1):
            if vector[i] > std_value:
                return float(i)
        return 0.0

    @staticmethod
    def get_dft_amplitudes(signals: list[float]) -> list[float]:
        if len(signals) == 0:
            return []
        coefficients = fft.fft(
            signals + [0.0 for _ in range(len(signals))], n=len(signals)
        ).view(np.float64)
        amplitudes = [
            math.sqrt(
                (coefficients[2 * i] * coefficients[2 * i])
                + (coefficients[2 * i + 1] * coefficients[2 * i + 1])
            )
            for i in range(len(signals))
        ]
        return amplitudes

    def get_features(self, color_matrix: np.ndarray) -> list[float]:
        return self._count_tokens(color_matrix, lambda rgb: rgb == self.block_color)

    @staticmethod
    def _count_tokens(
        color_matrix: np.ndarray, predicate: Callable[[tuple[int, int, int]], bool]
    ) -> list[float]:
        results = [0.0 for _ in range(len(color_matrix))]
        for i in range(len(color_matrix)):
            for j in range(len(color_matrix[i])):
                rgb = _brg_to_rgb(color_matrix[i][j])
                if predicate(rgb):
                    results[i] += 1.0
        return results


@register(DORN_METRICS, "Dorn_VisualBandwidth2D")
class VisualBandwidth2D(DornMetric):
    def __init__(self, coordinate: str, kind: str):
        assert coordinate in ["X", "Y"], (
            f"coordinate must be in 'X' or 'Y', but {coordinate}"
        )
        assert kind in scratch_colors.BLOCKS, (
            f"kind must be in {scratch_colors.BLOCKS}, but {kind}"
        )
        self.block_color = scratch_colors.BLOCK_COLOR_MAPPING[kind]
        self.coordinate = coordinate

    @property
    def name(self) -> str:
        return f"Dorn Visual {self.coordinate} {scratch_colors.COLOR_BLOCK_MAPPING[self.block_color]}"

    def compute(self, color_matrix: np.ndarray) -> float:
        matrix = self.get_matrix(color_matrix)
        amplitudes = self.get_dft_amplitudes(matrix)
        if len(matrix) == 0 or len(matrix[0]) == 0:
            return 0.0
        rows, cols = len(matrix), len(matrix[0])
        ndarray = np.asarray(amplitudes)
        size = rows if self.coordinate == "X" else cols
        total = sum(
            [
                DFTBandwidth.calculate_bandwidth(
                    [
                        float(v)
                        for v in (
                            ndarray[i, :] if self.coordinate == "X" else ndarray[:, i]
                        )
                    ]
                )
                for i in range(size)
            ]
        )
        return total / size

    @classmethod
    def get_all_variants(cls) -> list["DornMetric"]:
        return [
            VisualBandwidth2D(coordinate, kind)
            for kind in scratch_colors.BLOCKS
            for coordinate in ["X", "Y"]
        ]

    @staticmethod
    def get_dft_amplitudes(signals: list[list[float]]) -> list[list[float]]:
        if len(signals) == 0 or len(signals[0]) == 0:
            return []

        coefficients = (
            fft.fft2(np.asarray(signals))
            .reshape((1, len(signals) * len(signals[0])))
            .view(np.float64)
            .reshape((len(signals), 2 * len(signals[0])))
        )
        amplitudes = [
            [
                math.sqrt(
                    (coefficients[i][2 * j] * coefficients[i][2 * j])
                    + (coefficients[i][2 * j + 1] * coefficients[i][2 * j + 1])
                )
                for j in range(len(signals[i]))
            ]
            for i in range(len(signals))
        ]
        return amplitudes

    def get_matrix(self, color_matrix: np.ndarray) -> list[list[float]]:
        matrix: list[list[float]] = []
        for i in range(len(color_matrix)):
            matrix.append([])
            for j in range(len(color_matrix[i])):
                rgb = _brg_to_rgb(color_matrix[i][j])
                matrix[i].append(1.0 if rgb == self.block_color else 0.0)
        return matrix


def _brg_to_rgb(color: np.ndarray) -> tuple[int, int, int]:
    assert len(color) == 3
    return int(color[2]), int(color[1]), int(color[0])
