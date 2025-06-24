# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{pkgs, ...}: let
  node = pkgs.nodejs_20;
in
  pkgs.buildNpmPackage rec {
    pname = "screenshot";
    version = "0.1.0";
    src = ./.;
    npmDepsHash = "sha256-nmzn2pkXxK1n86hjJEL36xm0YfGx0xuNI+bJ0QXW/Wc=";
    dontNpmBuild = true;
  }
