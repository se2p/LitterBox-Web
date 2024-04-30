#! /usr/bin/env sh
#
# Copyright (C) 2024 LitterBox-Web contributors
#
# This file is part of LitterBox-Web.
# Licenced under the EUPL-1.2 or later.
#
# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
# SPDX-License-Identifier: EUPL-1.2
#


awk -F"," '{
        instructions += $4 + $5;
        covered += $5;
        branches += $6 + $7;
        branchesCovered += $7;
    } END {
        print "Instructions Covered:", covered, "/", instructions;
        print "Instruction Coverage:", 100*covered/instructions, "%";
        print "Branches Covered:", branchesCovered, "/", branches;
        print "Branch Coverage:", 100*branchesCovered/branches, "%";
    }' "$1"
