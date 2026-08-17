package com.niyamstack.propel;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
@EntityScan(basePackages = "com.niyamstack.propel.domain")
public class PropelApplication {
    public static void main(String[] args) {
        SpringApplication.run(PropelApplication.class, args);
    }
}
