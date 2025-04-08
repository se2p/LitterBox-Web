# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import torch
from torch import nn


class BaseModel(nn.Module):
    def __init__(self):
        super().__init__()
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    @property
    def total_params(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


class MLP(BaseModel):
    def __init__(self, layers_shapes: list[tuple[int, int]], dropout_positions=None, dropout=0.):
        super().__init__()
        layers = []
        for shape in layers_shapes[:-1]:
            layers.append(nn.Linear(*shape))
            layers.append(nn.ReLU())

        layers.append(nn.Linear(*layers_shapes[-1]))
        layers.append(nn.Sigmoid())
        for pos in dropout_positions:
            layers.insert(pos, nn.Dropout(dropout))
        self.first_layer = layers[0]
        self.model = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)

    def update_input_length(self, input_length: int) -> None:
        """
        Update the input length of the forward classification layers, if needed.
        :param input_length: The new input length.
        :return: The output.
        """
        if input_length != self.first_layer.in_features:
            self.first_layer = nn.Linear(input_length, self.first_layer.out_features)
            self.first_layer.to(self.device)
            self.model[0] = self.first_layer
