package com.niyamstack.propel.security;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Organization;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class LicenseFilter extends OncePerRequestFilter {
    private final LicenseService licenses;
    private final Store store;
    private final TransactionTemplate tx;

    public LicenseFilter(LicenseService licenses, Store store, PlatformTransactionManager transactions) {
        this.licenses = licenses;
        this.store = store;
        this.tx = new TransactionTemplate(transactions);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof PropelUser user && user.organizationId() != null) {
            try {
                Organization[] orgHolder = new Organization[1];
                tx.executeWithoutResult(status -> {
                    PropelUser licensed = licenses.enrich(user);
                    orgHolder[0] = store.get(Organization.class, user.organizationId());
                    var next = new UsernamePasswordAuthenticationToken(
                            licensed,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + licensed.role()))
                    );
                    SecurityContextHolder.getContext().setAuthentication(next);
                });
                Organization org = orgHolder[0];
                if (OrgAccess.suspended(org)) {
                    reject(response, HttpServletResponse.SC_FORBIDDEN, OrgAccess.SUSPENDED_MESSAGE);
                    return;
                }
                if (OrgAccess.demo(org) && OrgAccess.writeBlockedForDemo(request.getMethod(), request.getRequestURI())) {
                    reject(response, HttpServletResponse.SC_FORBIDDEN, OrgAccess.SUBSCRIBE_MESSAGE);
                    return;
                }
            } catch (Exception ignored) {
                /* keep the JWT principal if the org row cannot be loaded */
            }
        }
        chain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        byte[] body = ("{\"error\":\"" + message.replace("\"", "'") + "\"}").getBytes(StandardCharsets.UTF_8);
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentLength(body.length);
        response.getOutputStream().write(body);
        response.flushBuffer();
    }
}
