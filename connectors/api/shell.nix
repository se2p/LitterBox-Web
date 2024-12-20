# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
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
      languages.python = {
        enable = true;
        package = pkgs.python310;
        uv.enable = true;
      };
    }
  ];
}
