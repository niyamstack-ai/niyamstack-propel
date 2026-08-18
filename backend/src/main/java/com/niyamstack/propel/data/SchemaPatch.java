package com.niyamstack.propel.data;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;

@Configuration
public class SchemaPatch {
    private static final Logger log = LoggerFactory.getLogger(SchemaPatch.class);

    @Bean
    HibernatePropertiesCustomizer schemaPatchCustomizer(DataSource dataSource) {
        patch(dataSource);
        return hibernateProperties -> {};
    }

    private static void patch(DataSource dataSource) {
        List<String> statements = List.of(
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug VARCHAR(80)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_status VARCHAR(40) DEFAULT 'ACTIVE'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_primary VARCHAR(20)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_secondary VARCHAR(20)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER DEFAULT 0",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE",
                "UPDATE users SET failed_logins = 0 WHERE failed_logins IS NULL",
                "UPDATE organizations SET access_status = 'ACTIVE' WHERE access_status IS NULL",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'UNPAID'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deal_amount NUMERIC(12,2)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS modules_csv VARCHAR(500)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_students INTEGER",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_centers INTEGER",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(80)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deal_notes VARCHAR(1000)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_by UUID",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url VARCHAR(500)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS app_share_url VARCHAR(500)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(200)",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_published BOOLEAN DEFAULT FALSE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500)",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(80)",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS sub_category VARCHAR(80)",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_type VARCHAR(20) DEFAULT 'PAID'",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_type VARCHAR(40) DEFAULT 'SINGLE'",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_value INTEGER",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_unit VARCHAR(20) DEFAULT 'MONTH'",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT TRUE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_offline BOOLEAN DEFAULT FALSE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_trial BOOLEAN DEFAULT FALSE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_preview BOOLEAN DEFAULT FALSE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_live BOOLEAN DEFAULT TRUE",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS about TEXT",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number VARCHAR(80)",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_joining DATE",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS institute_name VARCHAR(200)",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS permanent_address VARCHAR(500)",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500)",
                "ALTER TABLE assignments ADD COLUMN IF NOT EXISTS course_id UUID",
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS course_id UUID",
                """
                CREATE TABLE IF NOT EXISTS course_enrollments (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    student_id UUID NOT NULL,
                    course_id UUID NOT NULL,
                    invoice_id UUID,
                    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
                    source VARCHAR(40) NOT NULL DEFAULT 'WEBSITE',
                    purchased_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                "UPDATE organizations SET payment_status = 'UNPAID' WHERE payment_status IS NULL",
                "UPDATE organizations SET payment_status = 'PAID' WHERE access_status = 'ACTIVE' AND payment_status = 'UNPAID'",
                """
                CREATE TABLE IF NOT EXISTS platform_settings (
                    id UUID PRIMARY KEY,
                    setting_key VARCHAR(80) NOT NULL,
                    setting_value VARCHAR(4000),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS platform_roles (
                    id UUID PRIMARY KEY,
                    name VARCHAR(80) NOT NULL,
                    capabilities_csv VARCHAR(1000),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS platform_user_roles (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL,
                    role_id UUID NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """
        );
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            for (String sql : statements) {
                try {
                    statement.execute(sql);
                } catch (Exception ex) {
                    log.debug("Schema patch skipped: {} ({})", sql, ex.getMessage());
                }
            }
        } catch (Exception ex) {
            log.warn("Could not patch schema before Hibernate: {}", ex.getMessage());
        }
    }
}
