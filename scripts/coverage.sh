#! /usr/bin/env sh
#
# Copyright (C) 2024 LitterBox-Web contributors
#
# This file is part of LitterBox-Web.
#
# SPDX-FileCopyrightText: 2024 LitterBox-Web contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# LitterBox-Web is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public Licence as published by
# the Free Software Foundation, either version 3 of the Licence, or (at
# your option) any later version.
#
# LitterBox-Web is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public Licence for more details.
#
# You should have received a copy of the GNU General Public Licence
# along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
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
