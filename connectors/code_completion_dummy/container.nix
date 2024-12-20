# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  pkgs,
  code-completion-dummy-app,
  ...
}:
pkgs.dockerTools.buildLayeredImage {
  name = "code-completion-dummy";
  tag = "${code-completion-dummy-app.version}";
  contents = [
    code-completion-dummy-app
  ];
  config = {
    ExposedPorts = {
      "8080/tcp" = {};
    };
    WorkingDir = "/app";
    Entrypoint = [
      "${code-completion-dummy-app}/bin/code-completion-dummy"
    ];
  };
}
