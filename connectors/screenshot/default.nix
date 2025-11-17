# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{pkgs, ...}: let
  node = pkgs.nodejs_24;
in
  pkgs.buildNpmPackage rec {
    pname = "screenshot";
    version = "0.1.0";
    src = ./.;
    buildInputs = [node];
    npmDeps = pkgs.importNpmLock {
      npmRoot = ./.;
    };
    npmConfigHook = pkgs.importNpmLock.npmConfigHook;
    dontNpmBuild = true;
  }
