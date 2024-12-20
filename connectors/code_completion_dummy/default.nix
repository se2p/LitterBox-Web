# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  pkgs,
  litterbox-web-api,
  ...
}: let
  python = pkgs.python312;
in
  python.pkgs.buildPythonApplication rec {
    pname = "code-completion-dummy";
    version = "0.1.0";
    src = ./.;
    pyproject = true;
    build-system = [
      python.pkgs.setuptools
    ];
    dependencies = with python.pkgs; [
      fastapi
      litterbox-web-api
      pydantic
      uvicorn
    ];
    pythonRelaxDeps = [
      "uvicorn"
    ];
  }
