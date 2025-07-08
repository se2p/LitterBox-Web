# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

import json
import logging

import transformers

from code_readability import constant

log = logging.getLogger(__name__)


def load_vocabulary() -> dict[str, int]:
    with (constant.TOKENIZER_PATH / "vocab.json").open() as f:
        return json.load(f)


def load_tokenizer() -> transformers.PreTrainedTokenizerBase:
    tokenizer = transformers.AutoTokenizer.from_pretrained(constant.TOKENIZER_PATH)
    assert isinstance(tokenizer, transformers.PreTrainedTokenizerBase)
    return tokenizer


def load_roberta() -> transformers.RobertaModel:
    config = transformers.AutoConfig.from_pretrained(
        constant.ROBERTA_CONFIG_PATH, local_files_only=True
    )
    roberta = transformers.AutoModel.from_config(config=config)
    return roberta


def adapt_to_former_tokenizer(tokens: list[str]) -> list[str]:
    # New version of Litter Box produces different tokens in these cases
    # Need to adjust to be similar to older version
    new_tokens_mapping = {
        "VAR": "_VAR_",
        "PROCEDURE_DEFINITION": "procedures_definition",
        "CUSTOM_BLOCK": "procedures_call",
        "motion_glidesecsto": "motion_glideto",
    }
    vocab = load_vocabulary()
    results = []
    for token in tokens:
        if token in new_tokens_mapping:
            results.append(new_tokens_mapping[token])
        elif (
            token in ["(", ")", ">", "<"]
            or token.startswith("LITERAL_")
            or token.startswith("BEGIN_")
            or token.startswith("END_")
        ):
            continue
        elif token not in vocab:
            log.debug(f"Ignore token not in vocabulary: {token}")
            continue
        else:
            results.append(token)
        if (
            token.startswith("operator_")
            and len(results) > 1
            and results[-2] == "_VAR_"
        ):
            # New version put operator blocks after VAR block, however, the older one do in the opposite
            # Need to swap the position of those 2 blocks
            tmp = results[-1]
            results[-1] = results[-2]
            results[-2] = tmp
    return results


def get_sentence_for_roberta(
    tokens_lists: list[list[str]],
    sep_token: str,
) -> str:
    new_tokens_lists = [adapt_to_former_tokenizer(tokens) for tokens in tokens_lists]
    sentence = " ".join(
        [" ".join([t for t in tokens]) + f" {sep_token}" for tokens in new_tokens_lists]
    )
    return sentence
