package com.niyamstack.propel.security;

import com.niyamstack.propel.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class IpRateLimiter {
    private static final int MAX_FAILURES = 30;
    private final ConcurrentHashMap<String, Integer> ipFailures = new ConcurrentHashMap<>();

    public void guard(HttpServletRequest request) {
        guard(clientIp(request));
    }

    public void guard(String ip) {
        if (ipFailures.getOrDefault(ip, 0) > MAX_FAILURES) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
        }
    }

    public void recordFailure(String ip) {
        ipFailures.merge(ip, 1, Integer::sum);
    }

    public void clear(String ip) {
        ipFailures.remove(ip);
    }

    public static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }
}
