# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  pkgs,
  maven ? pkgs.maven,
  jdk ? pkgs.jdk,
  litterboxWebVersion,
  litterbox-web-frontend,
  ...
}:
pkgs.maven.buildMavenPackage rec {
  pname = "litterbox-web-jar";
  version = litterboxWebVersion;
  nativeBuildInputs = [
    jdk
    maven
    pkgs.stripJavaArchivesHook
  ];
  src = ./.;
  buildOffline = true;
  mvnHash = "sha256-hZtw5nf10BgcTHviomm8s1qSlNzLvr9ePwUj2Uztaxk=";
  mvnParameters = "-DskipTests -Dfrontend.dist=${litterbox-web-frontend}/share/litterbox-web";
  # frontend used as separate input, should not be built here
  mvnDepsParameters = "-Dfrontend.dist=unused";
  installPhase = ''
    mkdir -p $out
    cp target/litterbox-web-${version}.jar $out/
  '';
}
