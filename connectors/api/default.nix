# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{pkgs, ...}:
pkgs.python3Packages.buildPythonApplication rec {
  pname = "code-completion-dummy";
  version = "0.1.0";
  src = ./.;
  format = "pyproject";
  doCheck = false;
  build-system = [
    pkgs.python3.pkgs.setuptools
  ];
  dependencies = with pkgs.python3.pkgs; [
    pydantic
  ];
}
