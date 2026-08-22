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
        litterboxWebVersion = "1.1.0-SNAPSHOT";
      in rec {
        devenv-up = self.devShells.${system}.default.config.procfileScript;

        default = import ./litterbox-web/default.nix {
          inherit pkgs jdk litterboxWebVersion litterbox-web-frontend;
        };

        litterbox-web-jar = default;

        litterbox-web-frontend = import ./frontend/default.nix {
          inherit pkgs;
        };

        litterbox-web = pkgs.stdenvNoCC.mkDerivation rec {
          pname = "litterbox-web";
          version = litterboxWebVersion;
          nativeBuildInputs = [pkgs.makeWrapper];
          src = null;
          dontUnpack = true;
          buildPhase = "";
          installPhase = ''
            makeWrapper ${jdk}/bin/java $out/bin/litterbox-web \
              --add-flags "-jar ${litterbox-web-jar}/litterbox-web-${version}.jar"
          '';
          meta = with pkgs.lib; {
            license = licenses.eupl12;
          };
        };

        litterbox-web-container = import ./litterbox-web/container.nix {
          inherit pkgs jdk litterbox-web-jar;
        };

        connector-api = import ./connectors/api/default.nix {
          inherit pkgs;
        };
        connector-code-completion-dummy = import ./connectors/code_completion_dummy/default.nix {
          inherit pkgs;
          litterbox-web-api = connector-api;
        };
        connector-container-code-completion-dummy = import ./connectors/code_completion_dummy/container.nix {
          inherit pkgs;
          code-completion-dummy-app = connector-code-completion-dummy;
        };
        connector-screenshot = import ./connectors/screenshot/default.nix {
          inherit pkgs;
        };
        connector-container-screenshot = import ./connectors/screenshot/container.nix {
          inherit pkgs;
          screenshot = connector-screenshot;
        };
        connector =
          pkgs.runCommand "litterbox-web-connectors" {
            passthru = {
              api = connector-api;
              code-completion-dummy = connector-code-completion-dummy;
              screenshot = connector-screenshot;
            };
          } ''
            mkdir -p $out
          '';
        connector-container =
          pkgs.runCommand "litterbox-web-connector-containers" {
            passthru = {
              code-completion-dummy = connector-container-code-completion-dummy;
              screenshot = connector-container-screenshot;
            };
          } ''
            mkdir -p $out
          '';
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
      in rec {
        default = devenv.lib.mkShell {
          inherit inputs pkgs;
          modules = [
            {
              devenv.root = let
                explicitRoot = builtins.getEnv "DEVENV_ROOT";
              in
                if explicitRoot != ""
                then explicitRoot
                else builtins.getEnv "PWD";
              packages = [
                pkgs.reuse
                mvn-lint
              ];
              languages.java = {
                enable = true;
                jdk.package = jdk;
                maven.enable = true;
              };
              git-hooks.hooks = {
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
                  entry = "cd litterbox-web && ${pkgs.maven}/bin/mvn license:check";
                  files = "^litterbox-web/src/.*";
                  pass_filenames = false;
                };
                spotless-fmt = {
                  enable = true;
                  name = "spotless-fmt";
                  description = "Check for correct Java source code formatting.";
                  entry = "cd litterbox-web && ${pkgs.maven}/bin/mvn spotless:check";
                  files = ".*\\.java$";
                  pass_filenames = false;
                };
                mvn-checkstyle = {
                  enable = true;
                  name = "mvn-checkstyle";
                  description = "Run Checkstyle checker.";
                  entry = "cd litterbox-web && ${pkgs.maven}/bin/mvn checkstyle:check";
                  files = ".*\\.java$";
                  pass_filenames = false;
                };
              };
            }
          ];
        };
        connectors-api = import ./connectors/api/shell.nix {
          inherit pkgs;
        };
        connectors-code-completion-dummy = import ./connectors/code_completion_dummy/shell.nix {
          inherit pkgs;
        };
        connectors-code-readability = import ./connectors/code_readability/shell.nix {
          inherit pkgs;
        };
        connectors-screenshot = import ./connectors/screenshot/shell.nix {
          inherit pkgs;
        };
        connectors = pkgs.mkShell {
          name = "litterbox-web-connector-shells";
          passthru = {
            api = connectors-api;
            code-completion-dummy = connectors-code-completion-dummy;
            code-readability = connectors-code-readability;
            screenshot = connectors-screenshot;
          };
        };
      });
  };
}
