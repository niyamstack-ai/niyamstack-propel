package com.niyamstack.propel;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
@EntityScan(basePackages = "com.niyamstack.propel.domain")
@EnableScheduling
public class PropelApplication {
    public static void main(String[] args) {
        SpringApplication.run(PropelApplication.class, args);
    }
}
