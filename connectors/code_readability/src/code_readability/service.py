# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import numpy as np
import torch
from litterbox_web_api.code_readability import (
    CodeReadabilityRequest,
    CodeReadabilityResponse,
)

from code_readability.model.towards_model import TowardsModel
from code_readability.processing import scratch_towards


class ReadabilityService:
    def __init__(self, model: TowardsModel):
        self.model = model

    def compute_readability(
        self,
        request: CodeReadabilityRequest,
    ) -> CodeReadabilityResponse:
        sample = scratch_towards.to_towards_sample(request=request)

        res = self.model.forward(
            visual=torch.from_numpy(np.expand_dims(sample["visual"], axis=0))
            .float()
            .to(self.model.device),
            semantic=[sample["semantic"]],
            structural=torch.from_numpy(np.expand_dims(sample["structural"], axis=0))
            .float()
            .to(self.model.device),
        )
        logits = res["logits"].detach().cpu()
        probs = logits.softmax(dim=1).tolist()[0]
        prediction = np.argmax(logits.tolist(), axis=-1)[0]

        return CodeReadabilityResponse(
            readable=prediction == 1,
            confidence=probs[prediction],
        )
