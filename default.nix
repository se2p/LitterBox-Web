# SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
#
# SPDX-License-Identifier: EUPL-1.2
{
  pkgs,
  maven ? pkgs.maven,
  jdk ? pkgs.jdk,
  litterboxWebVersion,
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
  mvnHash = "sha256-kSV51tlvMkZqdr4rWOZxGyh1hcIrLVhklggrD+4qnQs=";
  mvnParameters = "-DskipTests";
  installPhase = ''
    mkdir -p $out
    cp target/litterbox-web-${version}.jar $out/
  '';
}
