# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2

{ pkgs, jdk, litterbox-web-jar, ... }:
let
  javaVersion = pkgs.lib.versions.major jdk.version;
  litterbox-web-jar-module-deps = pkgs.stdenv.mkDerivation {
    name = "litterbox-web-jar-module-deps";
    nativeBuildInputs = [ jdk litterbox-web-jar ];
    src = ./.;
    buildPhase = ''
      jar xf ${litterbox-web-jar}/litterbox-web-*.jar
      jdeps \
        --ignore-missing-deps \
        -q \
        --recursive \
        --multi-release ${toString javaVersion} \
        --print-module-deps \
        --class-path 'BOOT-INF/lib/*' \
        ${litterbox-web-jar}/litterbox-web-*.jar | tee deps.info
    '';
    installPhase = ''
      mkdir -p $out
      cp deps.info $out/
    '';
  };
  jre = pkgs.jre_minimal.override {
    jdk = jdk;
    modules = pkgs.lib.strings.splitString "," (
      pkgs.lib.strings.removeSuffix "\n" (
        builtins.readFile "${litterbox-web-jar-module-deps}/deps.info"
      )
    );
  };
in
pkgs.dockerTools.buildImage {
  name = "litterbox-web";
  tag = "${litterbox-web-jar.version}";
  extraCommands = ''
    mkdir -p -m 777 tmp
  '';
  config = {
    ExposedPorts = {
      "8080/tcp" = { };
    };
    WorkingDir = "/app";
    Entrypoint = [
      "${jre}/bin/java"
      "-jar"
      "${litterbox-web-jar}/litterbox-web-${litterbox-web-jar.version}.jar"
    ];
  };
}
