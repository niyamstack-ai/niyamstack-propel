package com.niyamstack.propel.ess;

import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PasswordPolicy;
import com.niyamstack.propel.security.Phones;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class EssService {
    private static final Set<String> STAFF_ROLES = Set.of(
            Roles.OWNER, Roles.PLACEMENT_HEAD, Roles.FACULTY, Roles.COUNSELOR, Roles.ACCOUNTANT);
    private static final BigDecimal PF_WAGE_CAP = new BigDecimal("15000");
    private static final BigDecimal PF_RATE = new BigDecimal("0.12");
    private static final BigDecimal ESI_WAGE_CAP = new BigDecimal("21000");
    private static final BigDecimal ESI_EMPLOYEE = new BigDecimal("0.0075");
    private static final BigDecimal ESI_EMPLOYER = new BigDecimal("0.0325");
    private static final BigDecimal CL_DEFAULT = new BigDecimal("12");
    private static final BigDecimal SL_DEFAULT = new BigDecimal("6");
    private static final BigDecimal EL_DEFAULT = new BigDecimal("15");

    private final Store store;
    private final PasswordEncoder encoder;

    public EssService(Store store, PasswordEncoder encoder) {
        this.store = store;
        this.encoder = encoder;
    }

    public List<Map<String, Object>> employees() {
        requireEss();
        UUID org = orgId();
        List<Employee> rows = visibleEmployees();
        List<Center> centers = store.list(Center.class, org);
        List<LeaveBalance> bals = store.list(LeaveBalance.class, org);
        int year = LocalDate.now().getYear();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : rows) {
            Map<String, Object> row = employeeView(e, centers);
            bals.stream()
                    .filter(b -> e.getId().equals(b.getEmployeeId()) && yearEquals(b.getLeaveYear(), year))
                    .findFirst()
                    .ifPresent(b -> {
                        row.put("cl", b.getCl());
                        row.put("sl", b.getSl());
                        row.put("el", b.getEl());
                    });
            row.put("managerName", rows.stream()
                    .filter(m -> m.getId().equals(e.getManagerId()))
                    .map(Employee::getFullName)
                    .findFirst()
                    .orElse(""));
            if (e.getUserId() != null) {
                try {
                    AppUser user = store.get(AppUser.class, e.getUserId());
                    row.put("loginEmail", user.getEmail());
                    row.put("loginRole", user.getRole());
                } catch (Exception ignored) {
                    row.put("loginEmail", "");
                }
            }
            out.add(row);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> createEmployee(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        UUID org = orgId();
        String name = str(body, "fullName");
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        Employee e = new Employee();
        e.setOrganizationId(org);
        applyEmployee(e, body);
        if (e.getEmployeeCode() == null || e.getEmployeeCode().isBlank()) {
            e.setEmployeeCode(nextCode(org));
        }
        ensureUniqueCode(org, e.getEmployeeCode(), null);
        e = store.save(e);
        seedBalance(e);
        Map<String, Object> out = employeeView(e, store.list(Center.class, org));
        LeaveBalance seeded = balanceFor(e, LocalDate.now().getYear());
        out.put("cl", seeded.getCl());
        out.put("sl", seeded.getSl());
        out.put("el", seeded.getEl());
        if (bool(body, "createLogin")) {
            Map<String, Object> login = issueLogin(e, str(body, "loginRole"));
            out.putAll(login);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> updateEmployee(UUID id, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        Employee e = store.getOwned(Employee.class, id, orgId());
        applyEmployee(e, body);
        ensureUniqueCode(orgId(), e.getEmployeeCode(), e.getId());
        e = store.save(e);
        return employeeView(e, store.list(Center.class, orgId()));
    }

    @Transactional
    public Map<String, Object> issueLogin(UUID employeeId, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        Employee e = store.getOwned(Employee.class, employeeId, orgId());
        return issueLogin(e, str(body, "loginRole"));
    }

    public List<Map<String, Object>> attendance() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(StaffAttendance.class, orgId()).stream()
                .filter(a -> ids.contains(a.getEmployeeId()))
                .map(a -> attendanceView(a, visible))
                .toList();
    }

    @Transactional
    public Map<String, Object> markAttendance(Map<String, Object> body) {
        requireEss();
        Employee e = store.getOwned(Employee.class, uuid(body, "employeeId"), orgId());
        requireOwnOrAdmin(e);
        LocalDate parsed = date(body, "workDate");
        final LocalDate day = parsed == null ? LocalDate.now() : parsed;
        String shift = upper(str(body, "shift"), "FULL");
        StaffAttendance rec = store.listBy(StaffAttendance.class, orgId(), "employeeId", e.getId()).stream()
                .filter(a -> day.equals(a.getWorkDate()) && shift.equalsIgnoreCase(blank(a.getShift(), "FULL")))
                .findFirst()
                .orElseGet(StaffAttendance::new);
        rec.setOrganizationId(orgId());
        rec.setEmployeeId(e.getId());
        rec.setWorkDate(day);
        rec.setShift(shift);
        rec.setStatus(upper(str(body, "status"), "PRESENT"));
        rec.setSource(blank(str(body, "source"), "MANUAL"));
        rec.setInTime(time(body, "inTime"));
        rec.setOutTime(time(body, "outTime"));
        rec = store.save(rec);
        return attendanceView(rec, List.of(e));
    }

    public List<Map<String, Object>> punches() {
        requireEss();
        if (!hrAdmin()) {
            Employee me = selfEmployee(false);
            if (me == null) {
                return List.of();
            }
            UUID id = me.getId();
            return store.list(BiometricPunch.class, orgId()).stream()
                    .filter(p -> id.equals(p.getEmployeeId()))
                    .map(this::punchView)
                    .toList();
        }
        return store.list(BiometricPunch.class, orgId()).stream().map(this::punchView).toList();
    }

    @Transactional
    public Map<String, Object> biometric(Map<String, Object> body) {
        requireEss();
        return punch(orgId(), str(body, "code"), str(body, "deviceId"), str(body, "punchType"),
                str(body, "rawRef"), uuid(body, "studentId"), true);
    }

    @Transactional
    public List<Map<String, Object>> importPunches(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        String lines = str(body, "codes");
        String device = blank(str(body, "deviceId"), "IMPORT");
        String type = upper(str(body, "punchType"), "IN");
        List<Map<String, Object>> out = new ArrayList<>();
        for (String line : lines.split("\\R")) {
            String code = line.trim();
            if (code.isBlank()) {
                continue;
            }
            out.add(punch(orgId(), code, device, type, code, null, true));
        }
        return out;
    }

    @Transactional
    public Map<String, Object> publicPunch(String slug, Map<String, Object> body) {
        Organization org = store.findOrgBySlug(slug);
        if (org == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Institute not found");
        }
        if (!Packs.hasModule(org.getModulesCsv(), Packs.MOD_ESS)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This institute pack does not include ESS");
        }
        return punch(org.getId(), str(body, "code"), str(body, "deviceId"), str(body, "punchType"),
                str(body, "rawRef"), null, false);
    }

    public List<Map<String, Object>> leaves() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(LeaveRequest.class, orgId()).stream()
                .filter(r -> ids.contains(r.getEmployeeId()))
                .map(r -> leaveView(r, visible))
                .toList();
    }

    public List<Map<String, Object>> balances() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        int year = LocalDate.now().getYear();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : visible) {
            LeaveBalance b = balanceFor(e, year);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", b.getId());
            row.put("employeeId", e.getId());
            row.put("employeeName", e.getFullName());
            row.put("year", year);
            row.put("cl", b.getCl());
            row.put("sl", b.getSl());
            row.put("el", b.getEl());
            out.add(row);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> applyLeave(Map<String, Object> body) {
        requireEss();
        Employee e = resolveEmployee(uuid(body, "employeeId"));
        requireOwnOrAdmin(e);
        LocalDate from = date(body, "fromDate");
        LocalDate to = date(body, "toDate");
        if (from == null || to == null || to.isBefore(from)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Leave from and to dates are required");
        }
        String type = upper(str(body, "leaveType"), "CL");
        if (!Set.of("CL", "SL", "EL").contains(type)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Leave type must be CL, SL, or EL");
        }
        BigDecimal days = BigDecimal.valueOf(ChronoUnit.DAYS.between(from, to) + 1);
        LeaveBalance bal = balanceFor(e, from.getYear());
        if (remaining(bal, type).compareTo(days) < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Not enough " + type + " balance");
        }
        LeaveRequest req = new LeaveRequest();
        req.setOrganizationId(orgId());
        req.setEmployeeId(e.getId());
        req.setLeaveType(type);
        req.setFromDate(from);
        req.setToDate(to);
        req.setDays(days);
        req.setReason(str(body, "reason"));
        req.setStatus("PENDING");
        req = store.save(req);
        return leaveView(req, List.of(e));
    }

    @Transactional
    public Map<String, Object> decideLeave(UUID id, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        LeaveRequest req = store.getOwned(LeaveRequest.class, id, orgId());
        if (!"PENDING".equals(req.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This leave is already decided");
        }
        boolean approve = bool(body, "approve") || "APPROVED".equalsIgnoreCase(str(body, "status"));
        Employee e = store.getOwned(Employee.class, req.getEmployeeId(), orgId());
        if (approve) {
            LeaveBalance bal = balanceFor(e, req.getFromDate().getYear());
            if (remaining(bal, req.getLeaveType()).compareTo(req.getDays()) < 0) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Not enough " + req.getLeaveType() + " balance");
            }
            deduct(bal, req.getLeaveType(), req.getDays());
            store.save(bal);
            req.setStatus("APPROVED");
        } else {
            req.setStatus("REJECTED");
        }
        req.setDecidedBy(Auth.current().userId());
        req.setDecidedAt(Instant.now());
        req = store.save(req);
        return leaveView(req, List.of(e));
    }

    public List<Map<String, Object>> leaveCalendar(int year, int month) {
        requireEss();
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        Map<String, String> names = new java.util.HashMap<>();
        for (Employee e : visible) {
            names.put(e.getId().toString(), e.getFullName());
        }
        List<Map<String, Object>> days = new ArrayList<>();
        for (LeaveRequest req : store.list(LeaveRequest.class, orgId())) {
            if (!"APPROVED".equals(req.getStatus()) || !ids.contains(req.getEmployeeId())) {
                continue;
            }
            LocalDate from = req.getFromDate();
            LocalDate to = req.getToDate();
            if (from == null || to == null || to.isBefore(start) || from.isAfter(end)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", req.getId());
            row.put("employeeId", req.getEmployeeId());
            row.put("employeeName", names.getOrDefault(req.getEmployeeId().toString(), "Staff"));
            row.put("leaveType", req.getLeaveType());
            row.put("fromDate", from.toString());
            row.put("toDate", to.toString());
            row.put("days", req.getDays());
            days.add(row);
        }
        return days;
    }

    public List<Map<String, Object>> structures() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(SalaryStructure.class, orgId()).stream()
                .filter(s -> ids.contains(s.getEmployeeId()))
                .map(s -> structureView(s, visible))
                .toList();
    }

    @Transactional
    public Map<String, Object> saveStructure(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        Employee e = store.getOwned(Employee.class, uuid(body, "employeeId"), orgId());
        SalaryStructure s = store.listBy(SalaryStructure.class, orgId(), "employeeId", e.getId()).stream()
                .findFirst()
                .orElseGet(SalaryStructure::new);
        s.setOrganizationId(orgId());
        s.setEmployeeId(e.getId());
        s.setBasic(money(body, "basic"));
        s.setHra(money(body, "hra"));
        s.setSpecial(money(body, "special"));
        LocalDate from = date(body, "effectiveFrom");
        s.setEffectiveFrom(from == null ? LocalDate.now() : from);
        s = store.save(s);
        return structureView(s, List.of(e));
    }

    public List<Map<String, Object>> payslips() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(Payslip.class, orgId()).stream()
                .filter(p -> ids.contains(p.getEmployeeId()))
                .map(p -> payslipView(p, visible, false))
                .toList();
    }

    public Map<String, Object> payslip(UUID id) {
        requireEss();
        Payslip p = store.getOwned(Payslip.class, id, orgId());
        Employee e = store.getOwned(Employee.class, p.getEmployeeId(), orgId());
        requireOwnOrAdmin(e);
        return payslipView(p, List.of(e), true);
    }

    @Transactional
    public List<Map<String, Object>> runPayroll(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        int year = integer(body, "year", LocalDate.now().getYear());
        int month = integer(body, "month", LocalDate.now().getMonthValue());
        List<Employee> staff = store.list(Employee.class, orgId()).stream()
                .filter(e -> "ACTIVE".equalsIgnoreCase(blank(e.getStatus(), "ACTIVE")))
                .toList();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : staff) {
            boolean exists = store.listBy(Payslip.class, orgId(), "employeeId", e.getId()).stream()
                    .anyMatch(p -> yearEquals(p.getPayYear(), year) && yearEquals(p.getPayMonth(), month));
            if (exists) {
                continue;
            }
            SalaryStructure s = store.listBy(SalaryStructure.class, orgId(), "employeeId", e.getId()).stream()
                    .findFirst()
                    .orElse(null);
            if (s == null) {
                continue;
            }
            Payslip p = buildPayslip(e, s, year, month);
            p = store.save(p);
            out.add(payslipView(p, List.of(e), false));
        }
        return out;
    }

    public List<Map<String, Object>> vacancies() {
        requireEss();
        requireHrAdmin();
        return store.list(StaffVacancy.class, orgId()).stream().map(this::vacancyView).toList();
    }

    @Transactional
    public Map<String, Object> createVacancy(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        String title = str(body, "title");
        if (title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Job title is required");
        }
        StaffVacancy v = new StaffVacancy();
        v.setOrganizationId(orgId());
        v.setTitle(title);
        v.setDepartment(str(body, "department"));
        v.setOpenings(integer(body, "openings", 1));
        v.setStatus(upper(str(body, "status"), "OPEN"));
        v.setDescription(str(body, "description"));
        return vacancyView(store.save(v));
    }

    @Transactional
    public Map<String, Object> updateVacancy(UUID id, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        StaffVacancy v = store.getOwned(StaffVacancy.class, id, orgId());
        if (!str(body, "title").isBlank()) {
            v.setTitle(str(body, "title"));
        }
        if (body.containsKey("department")) {
            v.setDepartment(str(body, "department"));
        }
        if (body.containsKey("openings")) {
            v.setOpenings(integer(body, "openings", 1));
        }
        if (!str(body, "status").isBlank()) {
            v.setStatus(upper(str(body, "status"), v.getStatus()));
        }
        if (body.containsKey("description")) {
            v.setDescription(str(body, "description"));
        }
        return vacancyView(store.save(v));
    }

    public List<Map<String, Object>> candidates() {
        requireEss();
        requireHrAdmin();
        List<StaffVacancy> jobs = store.list(StaffVacancy.class, orgId());
        return store.list(StaffCandidate.class, orgId()).stream().map(c -> candidateView(c, jobs)).toList();
    }

    @Transactional
    public Map<String, Object> createCandidate(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        String name = str(body, "fullName");
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Applicant name is required");
        }
        UUID vacancyId = uuid(body, "vacancyId");
        if (vacancyId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Pick a job opening");
        }
        store.getOwned(StaffVacancy.class, vacancyId, orgId());
        StaffCandidate c = new StaffCandidate();
        c.setOrganizationId(orgId());
        c.setVacancyId(vacancyId);
        c.setFullName(name);
        c.setEmail(str(body, "email"));
        c.setPhone(Phones.normalize(str(body, "phone")));
        c.setStatus("APPLIED");
        c = store.save(c);
        return candidateView(c, store.list(StaffVacancy.class, orgId()));
    }

    @Transactional
    public Map<String, Object> advanceCandidate(UUID id, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        StaffCandidate c = store.getOwned(StaffCandidate.class, id, orgId());
        String status = upper(str(body, "status"), c.getStatus());
        if (!Set.of("APPLIED", "INTERVIEW", "OFFER", "HIRED", "REJECTED").contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown hiring status");
        }
        c.setStatus(status);
        if (!str(body, "interviewAt").isBlank()) {
            c.setInterviewAt(parseInstant(str(body, "interviewAt")));
        }
        if (body.containsKey("interviewNotes")) {
            c.setInterviewNotes(str(body, "interviewNotes"));
        }
        if (body.containsKey("offerCtc") && !str(body, "offerCtc").isBlank()) {
            c.setOfferCtc(money(body, "offerCtc"));
        }
        LocalDate joining = date(body, "offerJoiningDate");
        if (joining != null) {
            c.setOfferJoiningDate(joining);
        }
        c = store.save(c);
        return candidateView(c, store.list(StaffVacancy.class, orgId()));
    }

    @Transactional
    public Map<String, Object> hire(UUID candidateId, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        StaffCandidate c = store.getOwned(StaffCandidate.class, candidateId, orgId());
        StaffVacancy job = store.getOwned(StaffVacancy.class, c.getVacancyId(), orgId());
        Map<String, Object> empBody = new LinkedHashMap<>();
        empBody.put("fullName", c.getFullName());
        empBody.put("email", c.getEmail());
        empBody.put("phone", c.getPhone());
        empBody.put("department", job.getDepartment());
        empBody.put("designation", job.getTitle());
        empBody.put("joiningDate", c.getOfferJoiningDate() == null ? LocalDate.now().toString() : c.getOfferJoiningDate().toString());
        empBody.put("employmentType", blank(str(body, "employmentType"), "FACULTY"));
        empBody.put("createLogin", bool(body, "createLogin"));
        empBody.put("loginRole", blank(str(body, "loginRole"), "FACULTY"));
        Map<String, Object> employee = createEmployee(empBody);
        c.setStatus("HIRED");
        c.setHiredEmployeeId(UUID.fromString(employee.get("id").toString()));
        store.save(c);
        if (job.getOpenings() != null && job.getOpenings() > 0) {
            job.setOpenings(Math.max(0, job.getOpenings() - 1));
            if (job.getOpenings() == 0) {
                job.setStatus("CLOSED");
            }
            store.save(job);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("candidate", candidateView(c, List.of(job)));
        out.put("employee", employee);
        return out;
    }

    private Map<String, Object> punch(UUID org, String code, String deviceId, String punchType, String rawRef,
                                      UUID studentId, boolean authenticated) {
        String type = upper(punchType, "IN");
        Instant at = Instant.now();
        Employee employee = findEmployee(org, code);
        Student student = studentId != null ? store.getOwned(Student.class, studentId, org) : findStudent(org, code);
        if (employee == null && student == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No employee or student matches this code or mobile");
        }
        BiometricPunch punch = new BiometricPunch();
        punch.setOrganizationId(org);
        punch.setDeviceId(blank(deviceId, "DEVICE"));
        punch.setPunchAt(at);
        punch.setPunchType(type);
        punch.setRawRef(blank(rawRef, code));
        if (employee != null) {
            punch.setEmployeeId(employee.getId());
            upsertStaffDay(org, employee, LocalDate.now(), type, at);
        }
        if (student != null) {
            punch.setStudentId(student.getId());
            AttendanceRecord rec = new AttendanceRecord();
            rec.setOrganizationId(org);
            rec.setStudentId(student.getId());
            rec.setBatchId(student.getBatchId());
            rec.setSessionDate(LocalDate.now());
            rec.setStatus("PRESENT");
            rec.setSource("BIOMETRIC");
            store.save(rec);
        }
        punch = store.save(punch);
        Map<String, Object> out = punchView(punch);
        if (employee != null) {
            out.put("employeeName", employee.getFullName());
            out.put("employeeCode", employee.getEmployeeCode());
        }
        if (student != null) {
            out.put("studentName", student.getFullName());
        }
        if (authenticated) {
            out.put("source", "BIOMETRIC");
        }
        return out;
    }

    private void upsertStaffDay(UUID org, Employee employee, LocalDate day, String type, Instant at) {
        StaffAttendance rec = store.listBy(StaffAttendance.class, org, "employeeId", employee.getId()).stream()
                .filter(a -> day.equals(a.getWorkDate()) && "FULL".equalsIgnoreCase(blank(a.getShift(), "FULL")))
                .findFirst()
                .orElseGet(StaffAttendance::new);
        rec.setOrganizationId(org);
        rec.setEmployeeId(employee.getId());
        rec.setWorkDate(day);
        rec.setShift("FULL");
        rec.setStatus("PRESENT");
        rec.setSource("BIOMETRIC");
        LocalTime clock = LocalTime.ofInstant(at, java.time.ZoneId.systemDefault());
        if ("OUT".equals(type)) {
            rec.setOutTime(clock);
            if (rec.getInTime() == null) {
                rec.setInTime(clock);
            }
        } else {
            rec.setInTime(clock);
        }
        store.save(rec);
    }

    private Employee findEmployee(UUID org, String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String needle = code.trim();
        String phone = Phones.normalize(needle);
        return store.list(Employee.class, org).stream()
                .filter(e -> needle.equalsIgnoreCase(blank(e.getEmployeeCode(), ""))
                        || (!phone.isBlank() && phone.equals(Phones.normalize(e.getPhone()))))
                .findFirst()
                .orElse(null);
    }

    private Student findStudent(UUID org, String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String needle = code.trim();
        String phone = Phones.normalize(needle);
        return store.list(Student.class, org).stream()
                .filter(s -> needle.equalsIgnoreCase(blank(s.getStudentCode(), ""))
                        || needle.equalsIgnoreCase(blank(s.getRollNumber(), ""))
                        || (!phone.isBlank() && phone.equals(Phones.normalize(s.getPhone()))))
                .findFirst()
                .orElse(null);
    }

    private Map<String, Object> issueLogin(Employee e, String loginRole) {
        if (e.getUserId() != null) {
            AppUser existing = store.get(AppUser.class, e.getUserId());
            return Map.of("loginEmail", existing.getEmail(), "tempPassword", "");
        }
        String email = e.getEmail() == null ? "" : e.getEmail().trim().toLowerCase();
        if (email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add an email on the employee before creating a login");
        }
        if (store.findUserByEmail(email) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account");
        }
        String role = loginRole == null || loginRole.isBlank() ? Roles.FACULTY : loginRole.trim().toUpperCase();
        if (!STAFF_ROLES.contains(role) || Roles.OWNER.equals(role)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Choose faculty, counselor, accountant, or placement head");
        }
        String phone = Phones.normalize(e.getPhone());
        if (!phone.isBlank() && store.findUserByPhone(phone) != null) {
            throw new ApiException(HttpStatus.CONFLICT, "That mobile already has an account");
        }
        String temp = PasswordPolicy.temporary();
        PasswordPolicy.validate(temp);
        AppUser user = new AppUser();
        user.setOrganizationId(e.getOrganizationId());
        user.setCenterId(e.getCenterId());
        user.setFullName(e.getFullName());
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole(role);
        user.setActive(true);
        user.setPasswordHash(encoder.encode(temp));
        user.setPasswordChangedAt(Instant.now());
        user = store.save(user);
        e.setUserId(user.getId());
        store.save(e);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("loginEmail", user.getEmail());
        out.put("tempPassword", temp);
        out.put("userId", user.getId());
        return out;
    }

    private void applyEmployee(Employee e, Map<String, Object> body) {
        if (body.containsKey("fullName") && !str(body, "fullName").isBlank()) {
            e.setFullName(str(body, "fullName"));
        }
        if (body.containsKey("employeeCode")) {
            e.setEmployeeCode(str(body, "employeeCode"));
        }
        if (body.containsKey("email")) {
            e.setEmail(str(body, "email").toLowerCase());
        }
        if (body.containsKey("phone")) {
            e.setPhone(Phones.normalize(str(body, "phone")));
        }
        if (body.containsKey("department")) {
            e.setDepartment(str(body, "department"));
        }
        if (body.containsKey("designation")) {
            e.setDesignation(str(body, "designation"));
        }
        if (body.containsKey("joiningDate")) {
            e.setJoiningDate(date(body, "joiningDate"));
        }
        if (body.containsKey("centerId")) {
            e.setCenterId(uuid(body, "centerId"));
        }
        if (body.containsKey("managerId")) {
            e.setManagerId(uuid(body, "managerId"));
        }
        if (body.containsKey("userId")) {
            e.setUserId(uuid(body, "userId"));
        }
        if (body.containsKey("status") && !str(body, "status").isBlank()) {
            e.setStatus(upper(str(body, "status"), "ACTIVE"));
        }
        if (body.containsKey("employmentType") && !str(body, "employmentType").isBlank()) {
            e.setEmploymentType(upper(str(body, "employmentType"), "SUPPORT"));
        }
        if (e.getStatus() == null || e.getStatus().isBlank()) {
            e.setStatus("ACTIVE");
        }
        if (e.getEmploymentType() == null || e.getEmploymentType().isBlank()) {
            e.setEmploymentType("SUPPORT");
        }
    }

    private void seedBalance(Employee e) {
        int year = LocalDate.now().getYear();
        boolean exists = store.listBy(LeaveBalance.class, e.getOrganizationId(), "employeeId", e.getId()).stream()
                .anyMatch(b -> yearEquals(b.getLeaveYear(), year));
        if (exists) {
            return;
        }
        LeaveBalance b = new LeaveBalance();
        b.setOrganizationId(e.getOrganizationId());
        b.setEmployeeId(e.getId());
        b.setLeaveYear(year);
        b.setCl(CL_DEFAULT);
        b.setSl(SL_DEFAULT);
        b.setEl(EL_DEFAULT);
        store.save(b);
    }

    private LeaveBalance balanceFor(Employee e, int year) {
        return store.listBy(LeaveBalance.class, e.getOrganizationId(), "employeeId", e.getId()).stream()
                .filter(b -> yearEquals(b.getLeaveYear(), year))
                .findFirst()
                .orElseGet(() -> {
                    LeaveBalance b = new LeaveBalance();
                    b.setOrganizationId(e.getOrganizationId());
                    b.setEmployeeId(e.getId());
                    b.setLeaveYear(year);
                    b.setCl(CL_DEFAULT);
                    b.setSl(SL_DEFAULT);
                    b.setEl(EL_DEFAULT);
                    return store.save(b);
                });
    }

    private BigDecimal remaining(LeaveBalance b, String type) {
        return switch (type) {
            case "SL" -> nz(b.getSl());
            case "EL" -> nz(b.getEl());
            default -> nz(b.getCl());
        };
    }

    private void deduct(LeaveBalance b, String type, BigDecimal days) {
        switch (type) {
            case "SL" -> b.setSl(nz(b.getSl()).subtract(days));
            case "EL" -> b.setEl(nz(b.getEl()).subtract(days));
            default -> b.setCl(nz(b.getCl()).subtract(days));
        }
    }

    private Payslip buildPayslip(Employee e, SalaryStructure s, int year, int month) {
        BigDecimal basic = nz(s.getBasic());
        BigDecimal hra = nz(s.getHra());
        BigDecimal special = nz(s.getSpecial());
        BigDecimal gross = basic.add(hra).add(special);
        BigDecimal pfBase = basic.min(PF_WAGE_CAP);
        BigDecimal pf = pfBase.multiply(PF_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal esiEmp = BigDecimal.ZERO;
        BigDecimal esiEr = BigDecimal.ZERO;
        if (gross.compareTo(ESI_WAGE_CAP) <= 0) {
            esiEmp = gross.multiply(ESI_EMPLOYEE).setScale(2, RoundingMode.HALF_UP);
            esiEr = gross.multiply(ESI_EMPLOYER).setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal deductions = pf.add(esiEmp);
        Payslip p = new Payslip();
        p.setOrganizationId(e.getOrganizationId());
        p.setEmployeeId(e.getId());
        p.setPayYear(year);
        p.setPayMonth(month);
        p.setBasic(basic);
        p.setHra(hra);
        p.setSpecial(special);
        p.setGross(gross);
        p.setPfEmployee(pf);
        p.setEsiEmployee(esiEmp);
        p.setPfEmployer(pf);
        p.setEsiEmployer(esiEr);
        p.setDeductions(deductions);
        p.setNet(gross.subtract(deductions));
        p.setStatus("DRAFT");
        return p;
    }

    private List<Employee> visibleEmployees() {
        List<Employee> all = store.list(Employee.class, orgId());
        if (hrAdmin()) {
            return all;
        }
        Employee me = selfEmployee(false);
        if (me == null) {
            return List.of();
        }
        return all.stream().filter(e -> me.getId().equals(e.getId())).toList();
    }

    private Employee selfEmployee(boolean required) {
        PropelUser user = Auth.current();
        Employee byUser = store.list(Employee.class, user.organizationId()).stream()
                .filter(e -> user.userId().equals(e.getUserId()))
                .findFirst()
                .orElse(null);
        if (byUser != null) {
            return byUser;
        }
        if (user.email() != null) {
            Employee byEmail = store.list(Employee.class, user.organizationId()).stream()
                    .filter(e -> user.email().equalsIgnoreCase(blank(e.getEmail(), "")))
                    .findFirst()
                    .orElse(null);
            if (byEmail != null) {
                byEmail.setUserId(user.userId());
                return store.save(byEmail);
            }
        }
        if (required) {
            throw new ApiException(HttpStatus.FORBIDDEN, "No employee record is linked to this login. Ask the owner to add you in ESS.");
        }
        return null;
    }

    private Employee resolveEmployee(UUID id) {
        if (id == null) {
            return selfEmployee(true);
        }
        return store.getOwned(Employee.class, id, orgId());
    }

    private void requireOwnOrAdmin(Employee e) {
        if (hrAdmin()) {
            return;
        }
        Employee me = selfEmployee(true);
        if (!me.getId().equals(e.getId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You can only act on your own HR record");
        }
    }

    private void requireEss() {
        Access.requireTenant(Auth.current());
        Access.requireModule(Auth.current(), Packs.MOD_ESS);
        if (Roles.STUDENT.equals(Auth.current().role()) || Roles.PARENT.equals(Auth.current().role())
                || Roles.RECRUITER.equals(Auth.current().role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ESS is for institute staff");
        }
    }

    private void requireHrAdmin() {
        if (!hrAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the owner or accountant can change HR records");
        }
    }

    private boolean hrAdmin() {
        String role = Auth.current().role();
        return Roles.OWNER.equals(role) || Roles.ACCOUNTANT.equals(role);
    }

    private void ensureUniqueCode(UUID org, String code, UUID ignoreId) {
        if (code == null || code.isBlank()) {
            return;
        }
        boolean dup = store.list(Employee.class, org).stream()
                .anyMatch(e -> (ignoreId == null || !ignoreId.equals(e.getId()))
                        && code.equalsIgnoreCase(blank(e.getEmployeeCode(), "")));
        if (dup) {
            throw new ApiException(HttpStatus.CONFLICT, "That employee code is already in use");
        }
    }

    private String nextCode(UUID org) {
        int n = store.list(Employee.class, org).size() + 1;
        return "EMP-" + String.format("%04d", n);
    }

    private Map<String, Object> employeeView(Employee e, List<Center> centers) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", e.getId());
        row.put("employeeCode", e.getEmployeeCode());
        row.put("fullName", e.getFullName());
        row.put("email", e.getEmail());
        row.put("phone", e.getPhone());
        row.put("department", e.getDepartment());
        row.put("designation", e.getDesignation());
        row.put("joiningDate", e.getJoiningDate());
        row.put("centerId", e.getCenterId());
        row.put("centerName", centers.stream()
                .filter(c -> c.getId().equals(e.getCenterId()))
                .map(Center::getName)
                .findFirst()
                .orElse(""));
        row.put("managerId", e.getManagerId());
        row.put("userId", e.getUserId());
        row.put("status", e.getStatus());
        row.put("employmentType", e.getEmploymentType());
        row.put("hasLogin", e.getUserId() != null);
        return row;
    }

    private Map<String, Object> attendanceView(StaffAttendance a, List<Employee> staff) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", a.getId());
        row.put("employeeId", a.getEmployeeId());
        row.put("employeeName", staff.stream()
                .filter(e -> e.getId().equals(a.getEmployeeId()))
                .map(Employee::getFullName)
                .findFirst()
                .orElse(""));
        row.put("workDate", a.getWorkDate());
        row.put("shift", a.getShift());
        row.put("status", a.getStatus());
        row.put("source", a.getSource());
        row.put("inTime", a.getInTime());
        row.put("outTime", a.getOutTime());
        return row;
    }

    private Map<String, Object> punchView(BiometricPunch p) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", p.getId());
        row.put("employeeId", p.getEmployeeId());
        row.put("studentId", p.getStudentId());
        row.put("deviceId", p.getDeviceId());
        row.put("punchAt", p.getPunchAt());
        row.put("punchType", p.getPunchType());
        row.put("rawRef", p.getRawRef());
        return row;
    }

    private Map<String, Object> leaveView(LeaveRequest r, List<Employee> staff) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("employeeId", r.getEmployeeId());
        row.put("employeeName", staff.stream()
                .filter(e -> e.getId().equals(r.getEmployeeId()))
                .map(Employee::getFullName)
                .findFirst()
                .orElse(""));
        row.put("leaveType", r.getLeaveType());
        row.put("fromDate", r.getFromDate());
        row.put("toDate", r.getToDate());
        row.put("days", r.getDays());
        row.put("reason", r.getReason());
        row.put("status", r.getStatus());
        row.put("decidedAt", r.getDecidedAt());
        return row;
    }

    private Map<String, Object> structureView(SalaryStructure s, List<Employee> staff) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", s.getId());
        row.put("employeeId", s.getEmployeeId());
        row.put("employeeName", staff.stream()
                .filter(e -> e.getId().equals(s.getEmployeeId()))
                .map(Employee::getFullName)
                .findFirst()
                .orElse(""));
        row.put("basic", s.getBasic());
        row.put("hra", s.getHra());
        row.put("special", s.getSpecial());
        row.put("effectiveFrom", s.getEffectiveFrom());
        return row;
    }

    private Map<String, Object> payslipView(Payslip p, List<Employee> staff, boolean print) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", p.getId());
        row.put("employeeId", p.getEmployeeId());
        Employee e = staff.stream().filter(x -> x.getId().equals(p.getEmployeeId())).findFirst().orElse(null);
        row.put("employeeName", e == null ? "" : e.getFullName());
        row.put("employeeCode", e == null ? "" : e.getEmployeeCode());
        row.put("department", e == null ? "" : e.getDepartment());
        row.put("designation", e == null ? "" : e.getDesignation());
        row.put("year", p.getPayYear());
        row.put("month", p.getPayMonth());
        row.put("basic", p.getBasic());
        row.put("hra", p.getHra());
        row.put("special", p.getSpecial());
        row.put("gross", p.getGross());
        row.put("pfEmployee", p.getPfEmployee());
        row.put("esiEmployee", p.getEsiEmployee());
        row.put("pfEmployer", p.getPfEmployer());
        row.put("esiEmployer", p.getEsiEmployer());
        row.put("deductions", p.getDeductions());
        row.put("net", p.getNet());
        row.put("status", p.getStatus());
        if (print) {
            Organization org = store.get(Organization.class, orgId());
            row.put("instituteName", org.getName());
        }
        return row;
    }

    private Map<String, Object> vacancyView(StaffVacancy v) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", v.getId());
        row.put("title", v.getTitle());
        row.put("department", v.getDepartment());
        row.put("openings", v.getOpenings());
        row.put("status", v.getStatus());
        row.put("description", v.getDescription());
        return row;
    }

    private Map<String, Object> candidateView(StaffCandidate c, List<StaffVacancy> jobs) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", c.getId());
        row.put("vacancyId", c.getVacancyId());
        row.put("jobTitle", jobs.stream()
                .filter(j -> j.getId().equals(c.getVacancyId()))
                .map(StaffVacancy::getTitle)
                .findFirst()
                .orElse(""));
        row.put("fullName", c.getFullName());
        row.put("email", c.getEmail());
        row.put("phone", c.getPhone());
        row.put("status", c.getStatus());
        row.put("interviewAt", c.getInterviewAt());
        row.put("interviewNotes", c.getInterviewNotes());
        row.put("offerCtc", c.getOfferCtc());
        row.put("offerJoiningDate", c.getOfferJoiningDate());
        row.put("hiredEmployeeId", c.getHiredEmployeeId());
        return row;
    }

    private UUID orgId() {
        return Auth.current().organizationId();
    }

    private static boolean yearEquals(Integer value, int expected) {
        return value != null && value == expected;
    }

    private static String str(Map<String, ?> body, String key) {
        if (body == null || body.get(key) == null) {
            return "";
        }
        return String.valueOf(body.get(key)).trim();
    }

    private static boolean bool(Map<String, ?> body, String key) {
        Object v = body == null ? null : body.get(key);
        if (v instanceof Boolean b) {
            return b;
        }
        return "true".equalsIgnoreCase(str(body, key)) || "1".equals(str(body, key));
    }

    private static UUID uuid(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid " + key);
        }
    }

    private static LocalDate date(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank() || s.length() < 10) {
            return null;
        }
        return LocalDate.parse(s.substring(0, 10));
    }

    private static LocalTime time(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank()) {
            return null;
        }
        return LocalTime.parse(s.length() == 5 ? s + ":00" : s);
    }

    private static BigDecimal money(Map<String, ?> body, String key) {
        String s = str(body, key);
        if (s.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(s).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid amount for " + key);
        }
    }

    private static int integer(Map<String, ?> body, String key, int fallback) {
        String s = str(body, key);
        if (s.isBlank()) {
            return fallback;
        }
        try {
            return (int) Double.parseDouble(s);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static String upper(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().toUpperCase();
    }

    private static String blank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static Instant parseInstant(String raw) {
        try {
            return Instant.parse(raw);
        } catch (Exception ignored) {
            java.time.LocalDateTime local = java.time.LocalDateTime.parse(raw);
            return local.atZone(java.time.ZoneId.systemDefault()).toInstant();
        }
    }
}
