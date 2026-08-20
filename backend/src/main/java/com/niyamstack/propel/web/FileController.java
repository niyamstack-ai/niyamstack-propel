package com.niyamstack.propel.web;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
public class FileController {
    private final Path root;

    public FileController(@Value("${app.storage.local-dir:./data/files}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    @GetMapping("/api/files/{orgId}/{name:.+}")
    public ResponseEntity<Resource> get(@PathVariable String orgId, @PathVariable String name) {
        PropelUser user = Auth.current();
        if (user.organizationId() == null || !orgId.equals(user.organizationId().toString())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Not permitted");
        }
        Path dest = root.resolve(orgId).resolve(name).normalize();
        if (!dest.startsWith(root) || !Files.isRegularFile(dest)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "File not found");
        }
        String guessed = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try {
            String probed = Files.probeContentType(dest);
            if (probed != null) {
                guessed = probed;
            }
        } catch (Exception ignored) {
            /* keep default */
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + name.replace("\"", "") + "\"")
                .contentType(MediaType.parseMediaType(guessed))
                .body(new FileSystemResource(dest));
    }
}
