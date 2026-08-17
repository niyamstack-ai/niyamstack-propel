package com.niyamstack.propel.integration;

import java.io.InputStream;
import java.util.UUID;

public interface ObjectStorage {
    String provider();
    StoredObject put(UUID orgId, String originalName, String contentType, InputStream data, long size);

    record StoredObject(String key, String url, String provider) {}
}
