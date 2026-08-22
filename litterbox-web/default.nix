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
  manualMvnArtifacts = [
    "dev.langchain4j:langchain4j:1.14.1"
    "dev.langchain4j:langchain4j-open-ai:1.14.1"
    "dev.langchain4j:langchain4j-ollama:1.14.1"
    "dev.langchain4j:langchain4j-google-ai-gemini:1.14.1"
    "io.github.java-diff-utils:java-diff-utils:4.16"
  ];
  mvnHash = "sha256-e9aQpsGTNyV2etE7Ogzvh/SbKrSwDYzqUUru5kViGWo=";
  # The site is carried inside the jar, so the build is handed the derivation that produced it.
  mvnParameters = "-DskipTests -Dfrontend.dist=${litterbox-web-frontend}/share/litterbox-web";
  # Resolving dependencies is a separate build that is not given the parameters above, and the pom builds the site
  # itself when nobody has said where one is. Saying so here too keeps that profile out of the dependency set, which
  # would otherwise carry a plugin this build never runs and change mvnHash whenever the profile is touched. Only
  # the presence of the property matters: resolution never looks in the directory, so it need not be one, and naming
  # the frontend derivation here would make fetching dependencies wait for a site to be built first.
  mvnDepsParameters = "-Dfrontend.dist=unused";
  installPhase = ''
    mkdir -p $out
    cp target/litterbox-web-${version}.jar $out/
  '';
}
