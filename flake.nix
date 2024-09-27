# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
    devenv.url = "github:cachix/devenv";
    devenv.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = {
    self,
    nixpkgs,
    devenv,
    systems,
    ...
  } @ inputs: let
    javaVersion = 21;
    forEachSystem = nixpkgs.lib.genAttrs (import systems);
  in {
    packages =
      forEachSystem
      (system: let
        pkgs = nixpkgs.legacyPackages.${system};
        jdk = pkgs."jdk${toString javaVersion}_headless";
        maven = pkgs.maven.override {jdk_headless = jdk;};
        litterboxWebVersion = "0.0.1-SNAPSHOT";
      in rec {
        devenv-up = self.devShells.${system}.default.config.procfileScript;

        default = pkgs.stdenvNoCC.mkDerivation rec {
          pname = "litterbox-web";
          version = litterboxWebVersion;
          nativeBuildInputs = [pkgs.makeWrapper];
          src = ./.;
          buildPhase = "";
          installPhase = ''
            makeWrapper ${pkgs.jre}/bin/java $out/bin/litterbox-web \
              --add-flags "-jar ${litterbox-web-jar}/litterbox-web-${version}.jar"
          '';
          meta = with pkgs.lib; {
            license = licenses.eupl12;
          };
        };

        litterbox-web-jar = maven.buildMavenPackage rec {
          pname = "litterbox-web-jar";
          version = litterboxWebVersion;
          nativeBuildInputs = [
            jdk
            maven
            pkgs.stripJavaArchivesHook
          ];
          src = ./.;
          buildOffline = true;
          mvnHash = "sha256-kovNhrMCk62JwPh3aZkWq92FplABlU3Tq30XxyNWdbk=";
          mvnParameters = "-DskipTests";
          installPhase = ''
            mkdir -p $out
            cp target/litterbox-web-${version}.jar $out/
          '';
        };

        litterbox-web-container = import ./scripts/nix/container.nix {
          inherit pkgs jdk litterbox-web-jar;
        };
      });

    devShells =
      forEachSystem
      (system: let
        pkgs = nixpkgs.legacyPackages.${system};
        jdk = pkgs."jdk${toString javaVersion}_headless";
        mvn-lint = pkgs.writeScriptBin "mvn-lint" ''
          set -euo pipefail

          mvn license:format spotless:apply checkstyle:check
        '';
      in {
        default = devenv.lib.mkShell {
          inherit inputs pkgs;
          modules = [
            {
              packages = [
                pkgs.reuse
                mvn-lint
              ];
              languages.java = {
                enable = true;
                jdk.package = jdk;
                maven.enable = true;
              };
              pre-commit.hooks = {
                alejandra.enable = true;
                reuse-lint = {
                  enable = true;
                  name = "reuse-lint";
                  description = "Run reuse lint licence header checker.";
                  entry = "${pkgs.reuse}/bin/reuse lint";
                  pass_filenames = false;
                };
                mvn-licence = {
                  enable = true;
                  name = "mvn-licence";
                  description = "Run maven license header checker.";
                  entry = "${pkgs.maven}/bin/mvn license:check";
                  files = "^src/.*";
                  pass_filenames = false;
                };
                spotless-fmt = {
                  enable = true;
                  name = "spotless-fmt";
                  description = "Check for correct Java source code formatting.";
                  entry = "${pkgs.maven}/bin/mvn spotless:check";
                  files = ".*\\.java$";
                  pass_filenames = false;
                };
                mvn-checkstyle = {
                  enable = true;
                  name = "mvn-checkstyle";
                  description = "Run Checkstyle checker.";
                  entry = "${pkgs.maven}/bin/mvn checkstyle:check";
                  files = ".*\\.java$";
                  pass_filenames = false;
                };
              };
            }
          ];
        };
      });
  };
}
