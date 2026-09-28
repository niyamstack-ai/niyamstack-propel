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
import java.util.Locale;

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
        String guessed = guessContentType(dest, name);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + name.replace("\"", "") + "\"")
                .header("X-Frame-Options", "SAMEORIGIN")
                .contentType(MediaType.parseMediaType(guessed))
                .body(new FileSystemResource(dest));
    }

    static String guessContentType(Path dest, String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) {
            return MediaType.APPLICATION_PDF_VALUE;
        }
        if (lower.endsWith(".png")) {
            return MediaType.IMAGE_PNG_VALUE;
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return MediaType.IMAGE_JPEG_VALUE;
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        if (lower.endsWith(".mp4")) {
            return "video/mp4";
        }
        if (lower.endsWith(".webm")) {
            return "video/webm";
        }
        try {
            String probed = Files.probeContentType(dest);
            if (probed != null && !probed.isBlank() && !MediaType.APPLICATION_OCTET_STREAM_VALUE.equals(probed)) {
                return probed;
            }
        } catch (Exception ignored) {
            /* keep fallback */
        }
        return MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }
}
