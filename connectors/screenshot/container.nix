# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  pkgs,
  screenshot,
  ...
}:
pkgs.dockerTools.buildLayeredImage {
  name = "screenshot";
  tag = "${screenshot.version}";
  config = {
    ExposedPorts = {
      "3001/tcp" = {};
    };
    WorkingDir = "/app";
    Entrypoint = [
      "${screenshot}/bin/screenshot"
    ];
  };
}
