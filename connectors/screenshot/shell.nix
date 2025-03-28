# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  inputs,
  devenv,
  pkgs,
  ...
}:
devenv.lib.mkShell {
  inherit inputs pkgs;

  modules = [
    {
      languages.javascript = {
        enable = true;
        package = pkgs.nodejs_18;
        npm.enable = true;
        npm.install.enable = true;
      };
    }
  ];
}
