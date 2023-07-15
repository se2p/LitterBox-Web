package de.uni_passau.fim.se2.litterbox_web.rest;

import de.uni_passau.fim.se2.litterbox.ast.ParsingException;
import de.uni_passau.fim.se2.litterbox.ast.model.Program;
import de.uni_passau.fim.se2.litterbox.ast.parser.Scratch3Parser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.io.IOException;

@RestController
public class DummyResource {
    private static final Logger log = LoggerFactory.getLogger(DummyResource.class);

    private static final Scratch3Parser PARSER = new Scratch3Parser();

    @GetMapping("/ast")
    public String getProgram() throws ParsingException, IOException {
        final Program program = PARSER.parseJsonFile(new File("litterbox-web/src/main/resources/emptyProject.json"));
        return program.getIdent().getName();
    }
}
