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
                "ALTER TABLE courses ALTER COLUMN thumbnail_url SET DATA TYPE VARCHAR(1000)",
                "ALTER TABLE courses ALTER COLUMN thumbnail_url TYPE VARCHAR(1000)",
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
                "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS parent_folder_id UUID",
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS parent_folder_id UUID",
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER",
                "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
                "ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT",
                "ALTER TABLE doubt_tickets ADD COLUMN IF NOT EXISTS course_id UUID",
                "ALTER TABLE exam_attempts ALTER COLUMN answers_json SET DATA TYPE TEXT",
                "ALTER TABLE exam_attempts ALTER COLUMN answers_json TYPE TEXT",
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
                """,
                """
                CREATE TABLE IF NOT EXISTS content_progress (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    student_id UUID NOT NULL,
                    content_item_id UUID NOT NULL,
                    viewed_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20)",
                "ALTER TABLE questions ADD COLUMN IF NOT EXISTS language VARCHAR(40)",
                "ALTER TABLE questions ADD COLUMN IF NOT EXISTS starter_code TEXT",
                "ALTER TABLE questions ADD COLUMN IF NOT EXISTS tests_json TEXT",
                "UPDATE courses SET description = 'IPC theory and consultancy practice for working professionals.' WHERE description = 'dkjagskjdk'",
                "UPDATE assessments SET title = 'IPC basics check' WHERE title = 'abc'",
                "UPDATE questions SET prompt = 'Choose the correct option.' WHERE prompt = 'fff'",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS bundle_csv VARCHAR(1000)",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS course_id UUID",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_gstin VARCHAR(20)",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(80)",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sac_code VARCHAR(20)",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(255)",
                "ALTER TABLE fee_plans ADD COLUMN IF NOT EXISTS sac_code VARCHAR(20)",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS series_prefix VARCHAR(20)",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS fees_alt NUMERIC(12,2)",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_alt_value INTEGER",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS validity_alt_unit VARCHAR(20)",
                "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS credit_note_no VARCHAR(40)",
                "ALTER TABLE refunds ADD COLUMN IF NOT EXISTS gateway_refund_ref VARCHAR(80)",
                """
                CREATE TABLE IF NOT EXISTS site_hits (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    kind VARCHAR(40) NOT NULL,
                    path VARCHAR(200),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                "UPDATE courses SET fees = 45000 WHERE fees IS NOT NULL AND fees < 5000 AND (LOWER(TRIM(name)) LIKE '%ipc%' OR LOWER(CAST(description AS VARCHAR(4000))) LIKE '%ipc%')",
                "UPDATE courses SET name = TRIM(name) WHERE name IS NOT NULL AND name <> TRIM(name)",
                "UPDATE courses SET description = 'Excel, SQL, Power BI, and Python for working with real business data — live classes, recordings, and placement support.' WHERE LOWER(name) LIKE '%data analytics%' AND (description IS NULL OR LOWER(CAST(description AS VARCHAR(4000))) LIKE '%open this course%')",
                "UPDATE courses SET description = 'Java, Spring Boot, REST APIs, and PostgreSQL — live classes, recordings, and placement support.' WHERE LOWER(name) LIKE '%java%' AND (description IS NULL OR LOWER(CAST(description AS VARCHAR(4000))) LIKE '%open this course%')",
                "UPDATE courses SET validity_type = 'MULTIPLE', validity_value = 4, validity_unit = 'MONTH', fees_alt = 42000, validity_alt_value = 12, validity_alt_unit = 'MONTH' WHERE LOWER(name) LIKE '%data analytics%' AND (fees_alt IS NULL OR fees_alt = 0)",
                "UPDATE live_sessions SET provider = 'JITSI', meeting_url = 'https://meet.jit.si/NiyamstackJpamapping' WHERE meeting_url LIKE '%zoom.us/j/demo%'",
                "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE LOWER(email) IN ('deepak@yopmail.com', 'owner@aarohan.demo') OR phone = '9876500001'",
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS product_pack VARCHAR(40)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS capabilities_csv VARCHAR(500)",
                "UPDATE organizations SET product_pack = 'FULL_OPS' WHERE product_pack IS NULL OR product_pack = ''",
                "UPDATE organizations SET modules_csv = 'STUDENTS,CRM,LMS,FEES,PLACEMENT,COMMS,ANALYTICS,WEBSITE,TESTS,STAFF,GROW' WHERE product_pack = 'FULL_OPS' AND (modules_csv IS NULL OR TRIM(modules_csv) = '')",
                "UPDATE organizations SET product_pack = 'FULL_OPS', modules_csv = 'STUDENTS,CRM,LMS,FEES,PLACEMENT,COMMS,ANALYTICS,WEBSITE,TESTS,STAFF,GROW' WHERE (product_pack IS NULL OR product_pack = '' OR product_pack = 'FULL_OPS') AND (modules_csv IS NULL OR modules_csv NOT LIKE '%WEBSITE%' OR modules_csv NOT LIKE '%GROW%')",
                "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS scores_published BOOLEAN DEFAULT TRUE",
                "UPDATE assessments SET scores_published = TRUE WHERE scores_published IS NULL",
                "ALTER TABLE certificates ADD COLUMN IF NOT EXISTS course_id UUID",
                "ALTER TABLE certificates ADD COLUMN IF NOT EXISTS certificate_no VARCHAR(40)",
                "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS student_id UUID",
                """
                CREATE TABLE IF NOT EXISTS employees (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_code VARCHAR(80),
                    full_name VARCHAR(200),
                    email VARCHAR(200),
                    phone VARCHAR(40),
                    department VARCHAR(80),
                    designation VARCHAR(80),
                    joining_date DATE,
                    center_id UUID,
                    manager_id UUID,
                    user_id UUID,
                    status VARCHAR(40),
                    employment_type VARCHAR(40),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS staff_attendance (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID NOT NULL,
                    work_date DATE,
                    shift VARCHAR(40),
                    status VARCHAR(40),
                    source VARCHAR(40),
                    in_time TIME,
                    out_time TIME,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS biometric_punches (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID,
                    student_id UUID,
                    device_id VARCHAR(80),
                    punch_at TIMESTAMP WITH TIME ZONE,
                    punch_type VARCHAR(20),
                    raw_ref VARCHAR(200),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS leave_balances (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID NOT NULL,
                    leave_year INTEGER,
                    cl NUMERIC(8,1) DEFAULT 0,
                    sl NUMERIC(8,1) DEFAULT 0,
                    el NUMERIC(8,1) DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS leave_requests (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID NOT NULL,
                    leave_type VARCHAR(20),
                    from_date DATE,
                    to_date DATE,
                    days NUMERIC(8,1),
                    reason VARCHAR(1000),
                    status VARCHAR(40),
                    decided_by UUID,
                    decided_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS salary_structures (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID NOT NULL,
                    basic NUMERIC(12,2) DEFAULT 0,
                    hra NUMERIC(12,2) DEFAULT 0,
                    special NUMERIC(12,2) DEFAULT 0,
                    effective_from DATE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS payslips (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    employee_id UUID NOT NULL,
                    pay_year INTEGER,
                    pay_month INTEGER,
                    basic NUMERIC(12,2) DEFAULT 0,
                    hra NUMERIC(12,2) DEFAULT 0,
                    special NUMERIC(12,2) DEFAULT 0,
                    gross NUMERIC(12,2) DEFAULT 0,
                    pf_employee NUMERIC(12,2) DEFAULT 0,
                    esi_employee NUMERIC(12,2) DEFAULT 0,
                    pf_employer NUMERIC(12,2) DEFAULT 0,
                    esi_employer NUMERIC(12,2) DEFAULT 0,
                    deductions NUMERIC(12,2) DEFAULT 0,
                    net NUMERIC(12,2) DEFAULT 0,
                    status VARCHAR(40),
                    paid_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS staff_vacancies (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    title VARCHAR(200),
                    department VARCHAR(80),
                    openings INTEGER DEFAULT 1,
                    status VARCHAR(40),
                    description VARCHAR(2000),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS staff_candidates (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    vacancy_id UUID,
                    full_name VARCHAR(200),
                    email VARCHAR(200),
                    phone VARCHAR(40),
                    status VARCHAR(40),
                    interview_at TIMESTAMP WITH TIME ZONE,
                    interview_notes VARCHAR(1000),
                    offer_ctc NUMERIC(12,2),
                    offer_joining_date DATE,
                    hired_employee_id UUID,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                "ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS leave_year INTEGER",
                "ALTER TABLE payslips ADD COLUMN IF NOT EXISTS pay_year INTEGER",
                "ALTER TABLE payslips ADD COLUMN IF NOT EXISTS pay_month INTEGER",
                "ALTER TABLE batches ADD COLUMN IF NOT EXISTS term_id UUID",
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS term_id UUID",
                "ALTER TABLE fee_plans ADD COLUMN IF NOT EXISTS term_id UUID",
                "ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS options_json VARCHAR(1000)",
                "ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_json TEXT",
                "ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS custom_json TEXT",
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_json TEXT",
                "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_url VARCHAR(1000)",
                "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(40)",
                "ALTER TABLE recordings ADD COLUMN IF NOT EXISTS live_session_id UUID",
                "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS live_session_id UUID",
                "ALTER TABLE doubt_tickets ADD COLUMN IF NOT EXISTS sla_hours INTEGER",
                "ALTER TABLE doubt_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP WITH TIME ZONE",
                "UPDATE doubt_tickets SET sla_hours = 24 WHERE sla_hours IS NULL",
                "ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS landing_page_id UUID",
                "ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS referral_code VARCHAR(40)",
                "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS code VARCHAR(40)",
                "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS student_id UUID",
                "ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS student_id UUID",
                "ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS invoice_id UUID",
                "ALTER TABLE scholarships ADD COLUMN IF NOT EXISTS approval_request_id UUID",
                "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_send_status VARCHAR(40)",
                "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_send_detail VARCHAR(1000)",
                "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS detail VARCHAR(1000)",
                "ALTER TABLE one_to_one_sessions ADD COLUMN IF NOT EXISTS offering_id UUID",
                "ALTER TABLE one_to_one_sessions ADD COLUMN IF NOT EXISTS student_id UUID",
                "ALTER TABLE one_to_one_sessions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE",
                "ALTER TABLE one_to_one_sessions ADD COLUMN IF NOT EXISTS invoice_id UUID",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID",
                """
                CREATE TABLE IF NOT EXISTS report_definitions (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    name VARCHAR(255),
                    dataset VARCHAR(40),
                    columns_csv VARCHAR(2000),
                    filters_json TEXT,
                    created_by UUID,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS scheduled_reports (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    report_id UUID,
                    cadence VARCHAR(20),
                    email_to VARCHAR(255),
                    last_run_at TIMESTAMP WITH TIME ZONE,
                    next_run_at TIMESTAMP WITH TIME ZONE,
                    enabled BOOLEAN DEFAULT TRUE,
                    last_status VARCHAR(40),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS xapi_statements (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    student_id UUID,
                    course_id UUID,
                    verb VARCHAR(80),
                    object_id VARCHAR(255),
                    result_json TEXT,
                    statement_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS accreditation_folders (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    framework VARCHAR(40),
                    title VARCHAR(255),
                    status VARCHAR(40),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS accreditation_evidence (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    folder_id UUID,
                    title VARCHAR(255),
                    file_url VARCHAR(1000),
                    note VARCHAR(2000),
                    status VARCHAR(40),
                    approval_request_id UUID,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS approval_requests (
                    id UUID PRIMARY KEY,
                    organization_id UUID NOT NULL,
                    kind VARCHAR(40),
                    status VARCHAR(40),
                    student_id UUID,
                    inquiry_id UUID,
                    offer_id UUID,
                    amount NUMERIC(12,2),
                    note VARCHAR(1000),
                    requested_by UUID,
                    decided_by UUID,
                    decided_at TIMESTAMP WITH TIME ZONE,
                    payload_json VARCHAR(2000),
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
