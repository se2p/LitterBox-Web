#! /usr/bin/env bash
#
# Copyright (C) 2024 LitterBox-Web contributors
#
# This file is part of LitterBox-Web.
# Licenced under the EUPL-1.2 or later.
#
# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
# SPDX-License-Identifier: EUPL-1.2
#

subproject="$1"
coverage_metrics=$(sh scripts/coverage.sh "$2")

instruction_coverage=$(echo "$coverage_metrics" | sed -nr "s/Instruction Coverage: ([0-9]+.?[0-9]*) %/\1/p" | awk '{ print $1 / 100.0 }')
branch_coverage=$(echo "$coverage_metrics" | sed -nr "s/Branch Coverage: ([0-9]+.?[0-9]*) %/\1/p" | awk '{ print $1 / 100.0 }')

printf 'instruction_coverage_total{subproject="%s"} %f\n' "$subproject" "$instruction_coverage"
printf 'branch_coverage_total{subproject="%s"} %f\n' "$subproject" "$branch_coverage"
