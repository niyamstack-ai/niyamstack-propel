CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(300),
    gstin VARCHAR(32),
    email VARCHAR(200),
    phone VARCHAR(40),
    website VARCHAR(200),
    package_tier VARCHAR(20) NOT NULL DEFAULT 'STARTER',
    settings_json TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE centers (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(40),
    address VARCHAR(400),
    city VARCHAR(80),
    phone VARCHAR(40),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    center_id UUID REFERENCES centers(id),
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    phone VARCHAR(40),
    role VARCHAR(40) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE academic_years (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(80) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE terms (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id),
    name VARCHAR(80) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE courses (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    duration_months INTEGER,
    fees NUMERIC(12,2),
    eligibility TEXT,
    outcomes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE batches (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    center_id UUID REFERENCES centers(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    academic_year_id UUID REFERENCES academic_years(id),
    name VARCHAR(120) NOT NULL,
    capacity INTEGER,
    faculty_user_id UUID REFERENCES users(id),
    status VARCHAR(40) NOT NULL DEFAULT 'UPCOMING',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE classrooms (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    center_id UUID REFERENCES centers(id),
    name VARCHAR(120) NOT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'CLASSROOM',
    capacity INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE custom_fields (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    entity_type VARCHAR(60) NOT NULL,
    field_key VARCHAR(80) NOT NULL,
    label VARCHAR(120) NOT NULL,
    field_type VARCHAR(40) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    trigger_type VARCHAR(80) NOT NULL,
    steps_json TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE document_templates (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    kind VARCHAR(60) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE inquiries (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    center_id UUID REFERENCES centers(id),
    course_id UUID REFERENCES courses(id),
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(40),
    source VARCHAR(60) NOT NULL,
    stage VARCHAR(40) NOT NULL DEFAULT 'NEW',
    counselor_user_id UUID REFERENCES users(id),
    notes TEXT,
    student_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE counseling_notes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id),
    author_user_id UUID REFERENCES users(id),
    stage VARCHAR(40),
    note TEXT NOT NULL,
    next_action VARCHAR(200),
    next_action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE admission_forms (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    course_id UUID REFERENCES courses(id),
    applicant_name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(40),
    documents_json TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE eligibility_rules (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    applies_to VARCHAR(40) NOT NULL,
    rules_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE referrals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    referrer_name VARCHAR(200) NOT NULL,
    referrer_type VARCHAR(40) NOT NULL,
    inquiry_id UUID REFERENCES inquiries(id),
    incentive_amount NUMERIC(12,2),
    status VARCHAR(40) NOT NULL DEFAULT 'ATTRIBUTED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE scholarships (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(120) NOT NULL,
    percent NUMERIC(5,2),
    amount NUMERIC(12,2),
    approval_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE students (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    center_id UUID REFERENCES centers(id),
    course_id UUID REFERENCES courses(id),
    batch_id UUID REFERENCES batches(id),
    user_id UUID REFERENCES users(id),
    student_code VARCHAR(40) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(40),
    status VARCHAR(40) NOT NULL DEFAULT 'ENROLLED',
    enrollment_date DATE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (organization_id, student_code)
);

CREATE TABLE student_documents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    doc_type VARCHAR(60) NOT NULL,
    file_name VARCHAR(200) NOT NULL,
    storage_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE guardians (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    user_id UUID REFERENCES users(id),
    full_name VARCHAR(200) NOT NULL,
    relation VARCHAR(40),
    phone VARCHAR(40),
    email VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE timetable_slots (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID NOT NULL REFERENCES batches(id),
    classroom_id UUID REFERENCES classrooms(id),
    faculty_user_id UUID REFERENCES users(id),
    subject VARCHAR(120) NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE attendance_records (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    batch_id UUID REFERENCES batches(id),
    session_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE content_items (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    course_id UUID REFERENCES courses(id),
    title VARCHAR(200) NOT NULL,
    content_type VARCHAR(40) NOT NULL,
    url VARCHAR(500),
    body TEXT,
    scorm_standard VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE live_sessions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    title VARCHAR(200) NOT NULL,
    provider VARCHAR(40) NOT NULL,
    meeting_url VARCHAR(500),
    starts_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE recordings (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    title VARCHAR(200) NOT NULL,
    video_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    title VARCHAR(200) NOT NULL,
    instructions TEXT,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE submissions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    assignment_id UUID NOT NULL REFERENCES assignments(id),
    student_id UUID NOT NULL REFERENCES students(id),
    content TEXT,
    grade VARCHAR(20),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE assessments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    title VARCHAR(200) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    proctoring BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE questions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    assessment_id UUID REFERENCES assessments(id),
    subject VARCHAR(120),
    topic VARCHAR(120),
    difficulty VARCHAR(20),
    prompt TEXT NOT NULL,
    options_json TEXT,
    answer_key TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE doubt_tickets (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID REFERENCES students(id),
    batch_id UUID REFERENCES batches(id),
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    faculty_reply TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE certificates (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    title VARCHAR(200) NOT NULL,
    issued_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE fee_plans (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    course_id UUID REFERENCES courses(id),
    batch_id UUID REFERENCES batches(id),
    name VARCHAR(120) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    components_json TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    fee_plan_id UUID REFERENCES fee_plans(id),
    invoice_no VARCHAR(40) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'DUE',
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE payments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    amount NUMERIC(12,2) NOT NULL,
    method VARCHAR(40) NOT NULL,
    gateway_ref VARCHAR(120),
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'REQUESTED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    channel VARCHAR(40) NOT NULL,
    audience VARCHAR(80),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE announcements (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    batch_id UUID REFERENCES batches(id),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE message_templates (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    event_type VARCHAR(80) NOT NULL,
    channel VARCHAR(40) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE inbox_messages (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    from_name VARCHAR(200) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE skills (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    name VARCHAR(120) NOT NULL,
    proficiency VARCHAR(40),
    evidence VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE resumes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    version_label VARCHAR(80) NOT NULL,
    content TEXT NOT NULL,
    completeness INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE mock_interviews (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    kind VARCHAR(40) NOT NULL,
    scheduled_at TIMESTAMPTZ,
    score INTEGER,
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE practice_attempts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    kind VARCHAR(40) NOT NULL,
    score INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE companies (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    industry VARCHAR(80),
    contact_name VARCHAR(200),
    contact_email VARCHAR(200),
    hiring_preferences TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE drives (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    title VARCHAR(200) NOT NULL,
    job_description TEXT,
    package_lpa NUMERIC(8,2),
    locations VARCHAR(200),
    deadline DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE applications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    drive_id UUID NOT NULL REFERENCES drives(id),
    student_id UUID NOT NULL REFERENCES students(id),
    status VARCHAR(40) NOT NULL DEFAULT 'APPLIED',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE interview_rounds (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    application_id UUID NOT NULL REFERENCES applications(id),
    round_name VARCHAR(80) NOT NULL,
    panel TEXT,
    outcome VARCHAR(40),
    feedback TEXT,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE offers (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    application_id UUID NOT NULL REFERENCES applications(id),
    package_lpa NUMERIC(8,2),
    joining_date DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'OFFERED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE internships (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID NOT NULL REFERENCES students(id),
    company_id UUID REFERENCES companies(id),
    role VARCHAR(120) NOT NULL,
    stipend NUMERIC(12,2),
    start_date DATE,
    end_date DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'ONGOING',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE alumni (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    student_id UUID REFERENCES students(id),
    full_name VARCHAR(200) NOT NULL,
    company VARCHAR(200),
    role VARCHAR(120),
    engagement VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE alumni_jobs (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    alumni_id UUID REFERENCES alumni(id),
    title VARCHAR(200) NOT NULL,
    company VARCHAR(200),
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE industry_accounts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    mou BOOLEAN NOT NULL DEFAULT FALSE,
    owner_name VARCHAR(200),
    hiring_cycle VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE industry_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(200) NOT NULL,
    event_date DATE,
    attendance_count INTEGER,
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    raised_by VARCHAR(200) NOT NULL,
    category VARCHAR(80),
    subject VARCHAR(200) NOT NULL,
    body TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_students_org ON students(organization_id);
CREATE INDEX idx_inquiries_org ON inquiries(organization_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);
CREATE INDEX idx_applications_drive ON applications(drive_id);
