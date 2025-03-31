<!--
SPDX-FileCopyrightText: 2025 LitterBox-Web contributors

SPDX-License-Identifier: EUPL-1.2
-->

# Readme
Install dependencies
```bash
npm install
```

Run with
```bash
npm start
```

Call API
```bash
curl --location 'http://127.0.0.1:3001/svg?sprite=<sprite-name>&scale=<zoom-scale>' \
--header 'Content-Type: application/json' \
--data-raw '<project-json>'
```

To try the API, replace <project-json> with the content of Scratch project json file.
Besides, there are two optional query params:
- sprite: Name of the sprite that you want to export its SVG representation.
If null, default sprite will be used.
- scale: The zoom level determines the size of blocks. Default to 0.5625.
