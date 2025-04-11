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
      packages = [
        pkgs.cairo
      ];
      languages.python = {
        enable = true;
        package = pkgs.python313;
        uv.enable = true;
      };
    }
  ];
}
