package com.niyamstack.propel.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class LicenseFilter extends OncePerRequestFilter {
    private final LicenseService licenses;
    private final TransactionTemplate tx;

    public LicenseFilter(LicenseService licenses, PlatformTransactionManager transactions) {
        this.licenses = licenses;
        this.tx = new TransactionTemplate(transactions);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof PropelUser user && user.organizationId() != null) {
            try {
                tx.executeWithoutResult(status -> {
                    PropelUser licensed = licenses.enrich(user);
                    var next = new UsernamePasswordAuthenticationToken(
                            licensed,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + licensed.role()))
                    );
                    SecurityContextHolder.getContext().setAuthentication(next);
                });
            } catch (Exception ignored) {
                /* keep the JWT principal if the org row cannot be loaded */
            }
        }
        chain.doFilter(request, response);
    }
}
