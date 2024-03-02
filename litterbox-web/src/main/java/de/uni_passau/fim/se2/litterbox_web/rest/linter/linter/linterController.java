
/*
 * Copyright (C) 2023 LitterBox-Web contributors
 *
 * This file is part of LitterBox-Web.
 *
 * LitterBox-Web is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or (at
 * your option) any later version.
 *
 * LitterBox-Web is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with LitterBox-Web. If not, see <http://www.gnu.org/licenses/>.
 */
package de.uni_passau.fim.se2.litterbox_web.rest.linter.linter;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/linter")
public class linterController {
private final linterService linterService;
public linterController(linterService linterService){
    this.linterService = linterService;
}

@PostMapping("analyze")
    public List<IssueInfo> analyze(@RequestPart("file")
                                     MultipartFile sb3file) throws ParsingException, IOException{

    File tempFile = File.createTempFile("temp-", ".sb3");
    sb3file.transferTo(tempFile);
    return linterService.getIssues(tempFile);


}
}
