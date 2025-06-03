# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

from pathlib import Path
from typing import Literal

import torch
import transformers
from torch import nn

from code_readability.model.model import MLP, BaseModel
from code_readability.processing import oalmbbp


class StructuralEncoder(BaseModel):
    """
    A class for encoding code snippets as character matrices (ASCII values).
    """

    def __init__(self) -> None:
        super().__init__()
        self.model = nn.Sequential(
            nn.Conv2d(in_channels=1, out_channels=32, kernel_size=3),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            nn.Conv2d(in_channels=32, out_channels=32, kernel_size=3),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=3, stride=3),
            nn.Flatten(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass of the model.
        :param x: The input tensor that represents the character matrix.
        :return: The output tensor.
        """
        x.unsqueeze_(1)
        return self.model(x)


class VisualEncoder(BaseModel):
    """
    Use CNN to encode the screenshot of Scratch blocks of a sprite
    The input is an image of size (3, 411, 478).
    """

    def __init__(self) -> None:
        super().__init__()
        self.model = nn.Sequential(
            nn.Conv2d(in_channels=3, out_channels=32, kernel_size=3, padding="same"),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            nn.Conv2d(in_channels=32, out_channels=32, kernel_size=3, padding="same"),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding="same"),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2),
            nn.Flatten(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass of the model.
        :param x: The input tensor represents an image.
        :return: The output tensor.
        """
        return self.model(x)


class RobertaSemanticEncoder(BaseModel):
    def __init__(self, max_seq_len: int):
        super().__init__()
        self.max_seq_len = max_seq_len
        self.tokenizer = oalmbbp.load_tokenizer()
        self.roberta_model = oalmbbp.load_roberta()

    def forward(self, sentences: list[str]) -> torch.Tensor:
        batch_encoded = self.tokenizer(
            sentences,
            return_tensors="pt",
            padding=transformers.utils.PaddingStrategy.MAX_LENGTH,
            max_length=self.max_seq_len,
            truncation=True,
        )
        batch_encoded.to(self.device)
        outputs = self.roberta_model(**batch_encoded)  # type: ignore[operator]
        return outputs.last_hidden_state


class TowardsModel(BaseModel):
    def __init__(
        self, semantic_encoder: BaseModel, mode: Literal["all", "tv", "sv"] = "all"
    ) -> None:
        super().__init__()
        self.semantic_encoder: BaseModel | None = semantic_encoder
        self.visual_encoder: VisualEncoder | None = VisualEncoder()
        self.structural_encoder: StructuralEncoder | None = StructuralEncoder()
        self.mode = mode

        if mode == "st":
            self.visual_encoder = None
        elif mode == "tv":
            self.semantic_encoder = None
        elif mode == "sv":
            self.structural_encoder = None

        self.fc = MLP(
            layers_shapes=[(49664, 128), (128, 32), (32, 2)],
            dropout_positions=[2],
            dropout=0.2,
        )
        self.criterion = nn.CrossEntropyLoss()
        self.to(self.device)

    def forward(
        self,
        visual: torch.Tensor,
        semantic: list[str],
        structural: torch.Tensor,
        labels: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        features_list = []
        if self.semantic_encoder is not None:
            semantic_features = self.semantic_encoder(semantic)
            semantic_features = semantic_features.contiguous().view(
                semantic_features.shape[0], -1
            )
            features_list.append(semantic_features)
        if self.visual_encoder is not None:
            visual_features = self.visual_encoder(visual)
            features_list.append(visual_features)
        if self.structural_encoder is not None:
            structural_features = self.structural_encoder(structural)
            features_list.append(structural_features)

        # Concatenate the inputs
        features = torch.cat(features_list, dim=-1)

        # Update the input length of the forward classification layers
        self.fc.update_input_length(features.shape[1])

        # Pass through dense layers
        logits = self.fc(features)

        if labels is None:
            return {"logits": logits}

        loss = self.criterion(logits, labels)
        return {"logits": logits, "loss": loss}


def create_roberta_towards_model(
    roberta_seq_len: int = 256,
) -> TowardsModel:
    semantic_encoder = RobertaSemanticEncoder(max_seq_len=roberta_seq_len)
    return TowardsModel(semantic_encoder=semantic_encoder)


def load_roberta_towards_model(weights_path: Path) -> TowardsModel:
    model = create_roberta_towards_model()
    state_dict = torch.load(
        weights_path,
        map_location="cpu",
    )
    if "fc.first_layer.weight" in state_dict and isinstance(model.fc, MLP):
        model.fc.update_input_length(state_dict["fc.first_layer.weight"].shape[1])
    model.load_state_dict(state_dict, strict=False)
    return model
