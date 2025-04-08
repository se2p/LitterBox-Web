<!--
SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

SPDX-License-Identifier: EUPL-1.2
-->

# Readme

Install dependencies

```bash
uv sync
```

Run with

```bash
uvicorn code_readability.main:app
```

**Note**: Please set the following environment variables before running.

| ENV variables | Description                                                |
|---------------|------------------------------------------------------------|
| MODEL_PATH    | Path to the pretrained model file (e.g. pytorch_model.bin) | 
