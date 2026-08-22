# SPDX-FileCopyrightText: 2026 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{pkgs, ...}: let
  node = pkgs.nodejs_24;
in
  pkgs.buildNpmPackage {
    pname = "litterbox-web-frontend";
    version = "0.1.0";
    src = ./.;
    nodejs = node;
    npmDeps = pkgs.importNpmLock {
      npmRoot = ./.;
    };
    npmConfigHook = pkgs.importNpmLock.npmConfigHook;
    installPhase = ''
      runHook preInstall
      mkdir -p $out/share/litterbox-web
      cp -r dist/. $out/share/litterbox-web/
      runHook postInstall
    '';
  }
