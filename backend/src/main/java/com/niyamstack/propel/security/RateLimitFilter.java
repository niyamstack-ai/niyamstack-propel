package com.niyamstack.propel.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitFilter extends OncePerRequestFilter {
    private static final int LOGIN_LIMIT = 20;
    private static final int EXPORT_LIMIT = 30;
    private static final int COMPLIANCE_LIMIT = 40;
    private static final long WINDOW_MS = 60_000L;

    private final Map<String, Window> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        int limit = limitFor(path, request.getMethod());
        if (limit <= 0) {
            chain.doFilter(request, response);
            return;
        }
        String key = clientKey(request) + ":" + path;
        Window window = buckets.computeIfAbsent(key, k -> new Window());
        if (!window.tryConsume(limit)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Too many requests. Try again in a minute.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static int limitFor(String path, String method) {
        if ("POST".equalsIgnoreCase(method) && path.startsWith("/api/auth/login")) {
            return LOGIN_LIMIT;
        }
        if ("GET".equalsIgnoreCase(method) && path.startsWith("/api/actions/export/")) {
            return EXPORT_LIMIT;
        }
        if (path.startsWith("/api/actions/compliance/")) {
            return COMPLIANCE_LIMIT;
        }
        return 0;
    }

    private static String clientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private static final class Window {
        private long windowStart = System.currentTimeMillis();
        private final AtomicInteger count = new AtomicInteger();

        boolean tryConsume(int limit) {
            long now = System.currentTimeMillis();
            synchronized (this) {
                if (now - windowStart >= WINDOW_MS) {
                    windowStart = now;
                    count.set(0);
                }
            }
            return count.incrementAndGet() <= limit;
        }
    }
}
