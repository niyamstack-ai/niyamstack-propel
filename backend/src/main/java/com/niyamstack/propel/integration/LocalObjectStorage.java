package com.niyamstack.propel.integration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Service
public class LocalObjectStorage implements ObjectStorage {
    private final Path root;
    private final String provider;

    public LocalObjectStorage(
            @Value("${app.storage.local-dir:./data/files}") String dir,
            @Value("${app.integrations.storage.provider:local}") String provider
    ) {
        this.root = Path.of(dir);
        this.provider = provider;
    }

    @Override
    public String provider() {
        return "minio".equalsIgnoreCase(provider) ? "minio-pending" : "local";
    }

    @Override
    public StoredObject put(UUID orgId, String originalName, String contentType, InputStream data, long size) {
        try {
            String safe = originalName == null ? "file" : originalName.replaceAll("[^a-zA-Z0-9._-]", "_");
            String key = orgId + "/" + UUID.randomUUID() + "-" + safe;
            Path dest = root.resolve(key);
            Files.createDirectories(dest.getParent());
            Files.copy(data, dest);
            return new StoredObject(key, "/files/" + key, provider());
        } catch (IOException e) {
            throw new IllegalStateException("Could not store file");
        }
    }
}
