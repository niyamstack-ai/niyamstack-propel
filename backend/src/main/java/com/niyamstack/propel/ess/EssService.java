package com.niyamstack.propel.ess;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.compensation.CompensationService;
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
import java.util.HashSet;
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
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> HR_JSON_KEYS = Set.of("bankAccount", "pan", "uan", "esiNumber");

    private final Store store;
    private final PasswordEncoder encoder;
    private final CompensationService compensation;

    public EssService(Store store, PasswordEncoder encoder, CompensationService compensation) {
        this.store = store;
        this.encoder = encoder;
        this.compensation = compensation;
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
        Employee e = store.getOwned(Employee.class, id, orgId());
        if (hrAdmin()) {
            applyEmployee(e, body);
        } else {
            Employee me = selfEmployee(true);
            if (!me.getId().equals(e.getId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You can only edit your own profile");
            }
            applySelfProfile(e, body);
        }
        ensureUniqueCode(orgId(), e.getEmployeeCode(), e.getId());
        e = store.save(e);
        return employeeView(e, store.list(Center.class, orgId()));
    }

    public Map<String, Object> profile(UUID id) {
        requireEss();
        Employee e = id == null ? selfEmployee(true) : store.getOwned(Employee.class, id, orgId());
        requireProfileAccess(e);
        List<Center> centers = store.list(Center.class, orgId());
        List<Employee> all = store.list(Employee.class, orgId());
        Map<String, Object> out = employeeView(e, centers);
        out.put("managerName", all.stream()
                .filter(m -> m.getId().equals(e.getManagerId()))
                .map(Employee::getFullName)
                .findFirst()
                .orElse(""));
        out.put("directReports", all.stream()
                .filter(r -> e.getId().equals(r.getManagerId()))
                .map(Employee::getFullName)
                .toList());
        if (e.getUserId() != null) {
            try {
                AppUser user = store.get(AppUser.class, e.getUserId());
                out.put("loginEmail", user.getEmail());
                out.put("loginRole", user.getRole());
            } catch (Exception ignored) {
                out.put("loginEmail", "");
            }
        }
        LeaveBalance bal = balanceFor(e, LocalDate.now().getYear());
        out.put("cl", bal.getCl());
        out.put("sl", bal.getSl());
        out.put("el", bal.getEl());
        return out;
    }

    public List<Map<String, Object>> orgChart() {
        requireEss();
        if (!hrAdmin() && !Access.hasCap(Auth.current(), Packs.CAP_ESS_VIEW)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ESS access required");
        }
        List<Center> centers = store.list(Center.class, orgId());
        List<Employee> all = store.list(Employee.class, orgId());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : all) {
            Map<String, Object> row = employeeView(e, centers);
            row.put("managerName", all.stream()
                    .filter(m -> m.getId().equals(e.getManagerId()))
                    .map(Employee::getFullName)
                    .findFirst()
                    .orElse(""));
            row.put("reportCount", all.stream().filter(r -> e.getId().equals(r.getManagerId())).count());
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> holidays() {
        requireEss();
        return store.list(InstituteHoliday.class, orgId()).stream()
                .sorted(java.util.Comparator.comparing(InstituteHoliday::getHolidayDate,
                        java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())))
                .map(this::holidayView)
                .toList();
    }

    @Transactional
    public Map<String, Object> saveHoliday(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        String name = str(body, "name");
        LocalDate day = date(body, "holidayDate");
        if (name.isBlank() || day == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Holiday name and date are required");
        }
        InstituteHoliday h = new InstituteHoliday();
        h.setOrganizationId(orgId());
        h.setName(name);
        h.setHolidayDate(day);
        h.setCenterId(uuid(body, "centerId"));
        return holidayView(store.save(h));
    }

    @Transactional
    public void deleteHoliday(UUID id) {
        requireEss();
        requireHrAdmin();
        store.deleteOwned(InstituteHoliday.class, id, orgId());
    }

    public Map<String, Object> managerInbox() {
        requireEss();
        if (!hrAdmin() && !leaveApprover()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager or HR access required");
        }
        List<Employee> team = teamMembers();
        Set<UUID> ids = team.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        List<Map<String, Object>> pendingLeave = store.list(LeaveRequest.class, orgId()).stream()
                .filter(r -> "PENDING".equals(r.getStatus()) && ids.contains(r.getEmployeeId()))
                .map(r -> leaveView(r, team))
                .toList();
        List<Map<String, Object>> pendingReg = store.list(AttendanceRegularization.class, orgId()).stream()
                .filter(r -> "PENDING".equals(r.getStatus()) && ids.contains(r.getEmployeeId()))
                .map(r -> regView(r, team))
                .toList();
        List<Map<String, Object>> pendingResign = store.list(ResignationRequest.class, orgId()).stream()
                .filter(r -> "PENDING".equals(r.getStatus()) && (hrAdmin() || ids.contains(r.getEmployeeId())))
                .map(r -> resignView(r, team))
                .toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pendingLeave", pendingLeave.size());
        out.put("pendingRegularization", pendingReg.size());
        out.put("pendingResignation", pendingResign.size());
        out.put("leave", pendingLeave);
        out.put("regularization", pendingReg);
        out.put("resignation", hrAdmin() ? pendingResign : List.of());
        out.put("teamSize", team.size());
        return out;
    }

    public List<Map<String, Object>> teamAttendance(int year, int month) {
        requireEss();
        if (!hrAdmin() && !leaveApprover()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager or HR access required");
        }
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        List<Employee> team = teamMembers();
        Set<UUID> ids = team.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(StaffAttendance.class, orgId()).stream()
                .filter(a -> ids.contains(a.getEmployeeId()) && a.getWorkDate() != null
                        && !a.getWorkDate().isBefore(start) && !a.getWorkDate().isAfter(end))
                .map(a -> attendanceView(a, team))
                .toList();
    }

    public List<Map<String, Object>> teamLeaveCalendar(int year, int month) {
        requireEss();
        if (!hrAdmin() && !leaveApprover()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager or HR access required");
        }
        YearMonth ym = YearMonth.of(year, month);
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        List<Employee> team = teamMembers();
        Set<UUID> ids = team.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        Map<String, String> names = new java.util.HashMap<>();
        for (Employee e : team) {
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

    @Transactional
    public Map<String, Object> bulkDecideLeave(Map<String, Object> body) {
        requireEss();
        @SuppressWarnings("unchecked")
        List<String> rawIds = body.get("ids") instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
        if (rawIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Select at least one leave request");
        }
        boolean approve = bool(body, "approve");
        int processed = 0;
        List<String> errors = new ArrayList<>();
        for (String raw : rawIds) {
            try {
                decideLeave(UUID.fromString(raw), Map.of("approve", approve));
                processed++;
            } catch (ApiException ex) {
                errors.add(raw + ": " + ex.getMessage());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("processed", processed);
        out.put("errors", errors);
        return out;
    }

    public List<Map<String, Object>> regularizations() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(AttendanceRegularization.class, orgId()).stream()
                .filter(r -> ids.contains(r.getEmployeeId()))
                .map(r -> regView(r, visible))
                .toList();
    }

    @Transactional
    public Map<String, Object> applyRegularization(Map<String, Object> body) {
        requireEss();
        Employee e = resolveEmployee(uuid(body, "employeeId"));
        requireOwnOrAdmin(e);
        LocalDate day = date(body, "workDate");
        if (day == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Work date is required");
        }
        AttendanceRegularization reg = new AttendanceRegularization();
        reg.setOrganizationId(orgId());
        reg.setEmployeeId(e.getId());
        reg.setWorkDate(day);
        reg.setShift(upper(str(body, "shift"), "FULL"));
        reg.setRequestedStatus(upper(str(body, "requestedStatus"), "PRESENT"));
        reg.setInTime(time(body, "inTime"));
        reg.setOutTime(time(body, "outTime"));
        reg.setReason(str(body, "reason"));
        reg.setStatus("PENDING");
        reg = store.save(reg);
        notifyApproval("Attendance regularization", e.getFullName() + " requested " + reg.getRequestedStatus()
                + " for " + day + ". Open ESS → Team to approve.");
        return regView(reg, List.of(e));
    }

    @Transactional
    public Map<String, Object> decideRegularization(UUID id, Map<String, Object> body) {
        requireEss();
        AttendanceRegularization reg = store.getOwned(AttendanceRegularization.class, id, orgId());
        if (!"PENDING".equals(reg.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This request is already decided");
        }
        Employee e = store.getOwned(Employee.class, reg.getEmployeeId(), orgId());
        if (!canApproveLeaveFor(e)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You cannot approve this regularization");
        }
        boolean approve = bool(body, "approve");
        if (approve) {
            upsertAttendance(e, reg);
            reg.setStatus("APPROVED");
        } else {
            reg.setStatus("REJECTED");
        }
        reg.setDecidedBy(Auth.current().userId());
        reg.setDecidedAt(Instant.now());
        reg = store.save(reg);
        notifyEmployee(e, "Regularization " + reg.getStatus().toLowerCase(),
                "Your attendance correction for " + reg.getWorkDate() + " was " + reg.getStatus().toLowerCase() + ".");
        return regView(reg, List.of(e));
    }

    @Transactional
    public Map<String, Object> cancelRegularization(UUID id) {
        requireEss();
        AttendanceRegularization reg = store.getOwned(AttendanceRegularization.class, id, orgId());
        if (!"PENDING".equals(reg.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending requests can be cancelled");
        }
        Employee e = store.getOwned(Employee.class, reg.getEmployeeId(), orgId());
        requireOwnOrAdmin(e);
        reg.setStatus("CANCELLED");
        reg = store.save(reg);
        return regView(reg, List.of(e));
    }

    public Map<String, Object> leavePolicy() {
        requireEss();
        int year = LocalDate.now().getYear();
        LeavePolicy p = policyFor(year);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("leaveYear", year);
        out.put("clAnnual", p != null ? p.getClAnnual() : CL_DEFAULT);
        out.put("slAnnual", p != null ? p.getSlAnnual() : SL_DEFAULT);
        out.put("elAnnual", p != null ? p.getElAnnual() : EL_DEFAULT);
        out.put("excludeHolidays", p != null && Boolean.TRUE.equals(p.getExcludeHolidays()));
        if (p != null) {
            out.put("id", p.getId());
        }
        return out;
    }

    @Transactional
    public Map<String, Object> saveLeavePolicy(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        int year = integer(body, "leaveYear", LocalDate.now().getYear());
        LeavePolicy p = store.list(LeavePolicy.class, orgId()).stream()
                .filter(row -> yearEquals(row.getLeaveYear(), year))
                .findFirst()
                .orElseGet(LeavePolicy::new);
        p.setOrganizationId(orgId());
        p.setLeaveYear(year);
        p.setClAnnual(money(body, "clAnnual").max(BigDecimal.ZERO));
        p.setSlAnnual(money(body, "slAnnual").max(BigDecimal.ZERO));
        p.setElAnnual(money(body, "elAnnual").max(BigDecimal.ZERO));
        p.setExcludeHolidays(bool(body, "excludeHolidays"));
        if (p.getClAnnual().signum() == 0) {
            p.setClAnnual(CL_DEFAULT);
        }
        if (p.getSlAnnual().signum() == 0) {
            p.setSlAnnual(SL_DEFAULT);
        }
        if (p.getElAnnual().signum() == 0) {
            p.setElAnnual(EL_DEFAULT);
        }
        p = store.save(p);
        return leavePolicy();
    }

    public List<Map<String, Object>> employeeDocuments(UUID employeeId) {
        requireEss();
        Employee e = store.getOwned(Employee.class, employeeId, orgId());
        requireProfileAccess(e);
        return store.listBy(EmployeeDocument.class, orgId(), "employeeId", e.getId()).stream()
                .map(this::docView)
                .toList();
    }

    @Transactional
    public Map<String, Object> addEmployeeDocument(Map<String, Object> body) {
        requireEss();
        Employee e = store.getOwned(Employee.class, uuid(body, "employeeId"), orgId());
        if (!hrAdmin()) {
            Employee me = selfEmployee(true);
            if (!me.getId().equals(e.getId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You can only upload your own documents");
            }
        }
        String url = str(body, "storageUrl");
        if (url.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Document URL or path is required");
        }
        EmployeeDocument doc = new EmployeeDocument();
        doc.setOrganizationId(orgId());
        doc.setEmployeeId(e.getId());
        doc.setDocType(blank(str(body, "docType"), "OTHER"));
        doc.setFileName(blank(str(body, "fileName"), "Document"));
        doc.setStorageUrl(url);
        return docView(store.save(doc));
    }

    @Transactional
    public void deleteEmployeeDocument(UUID id) {
        requireEss();
        EmployeeDocument doc = store.getOwned(EmployeeDocument.class, id, orgId());
        Employee e = store.getOwned(Employee.class, doc.getEmployeeId(), orgId());
        if (!hrAdmin()) {
            Employee me = selfEmployee(true);
            if (!me.getId().equals(e.getId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You can only delete your own documents");
            }
        }
        store.deleteOwned(EmployeeDocument.class, id, orgId());
    }

    public List<Map<String, Object>> resignations() {
        requireEss();
        List<Employee> visible = visibleEmployees();
        Set<UUID> ids = visible.stream().map(Employee::getId).collect(java.util.stream.Collectors.toSet());
        return store.list(ResignationRequest.class, orgId()).stream()
                .filter(r -> hrAdmin() || ids.contains(r.getEmployeeId()))
                .map(r -> resignView(r, visible))
                .toList();
    }

    @Transactional
    public Map<String, Object> applyResignation(Map<String, Object> body) {
        requireEss();
        Employee e = selfEmployee(true);
        LocalDate lastDay = date(body, "lastWorkingDate");
        if (lastDay == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Last working date is required");
        }
        boolean pending = store.listBy(ResignationRequest.class, orgId(), "employeeId", e.getId()).stream()
                .anyMatch(r -> "PENDING".equals(r.getStatus()));
        if (pending) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You already have a pending resignation");
        }
        ResignationRequest req = new ResignationRequest();
        req.setOrganizationId(orgId());
        req.setEmployeeId(e.getId());
        req.setLastWorkingDate(lastDay);
        req.setReason(str(body, "reason"));
        req.setStatus("PENDING");
        req = store.save(req);
        notifyApproval("Resignation submitted", e.getFullName() + " submitted resignation effective " + lastDay + ".");
        return resignView(req, List.of(e));
    }

    @Transactional
    public Map<String, Object> decideResignation(UUID id, Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        ResignationRequest req = store.getOwned(ResignationRequest.class, id, orgId());
        if (!"PENDING".equals(req.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This resignation is already decided");
        }
        Employee e = store.getOwned(Employee.class, req.getEmployeeId(), orgId());
        boolean approve = bool(body, "approve");
        if (approve) {
            req.setStatus("APPROVED");
            e.setStatus("ON_NOTICE");
            store.save(e);
        } else {
            req.setStatus("REJECTED");
        }
        req.setDecidedBy(Auth.current().userId());
        req.setDecidedAt(Instant.now());
        req = store.save(req);
        notifyEmployee(e, "Resignation " + req.getStatus().toLowerCase(),
                "Your resignation request was " + req.getStatus().toLowerCase() + ".");
        return resignView(req, List.of(e));
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
        UUID employeeId = uuid(body, "employeeId");
        Employee e = employeeId == null ? selfEmployee(true) : store.getOwned(Employee.class, employeeId, orgId());
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
        notifyApproval("Leave request", e.getFullName() + " applied for " + type + " from " + from + " to " + to + ".");
        return leaveView(req, List.of(e));
    }

    @Transactional
    public Map<String, Object> decideLeave(UUID id, Map<String, Object> body) {
        requireEss();
        LeaveRequest req = store.getOwned(LeaveRequest.class, id, orgId());
        if (!"PENDING".equals(req.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This leave is already decided");
        }
        Employee e = store.getOwned(Employee.class, req.getEmployeeId(), orgId());
        if (!canApproveLeaveFor(e)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You cannot approve this leave request");
        }
        boolean approve = bool(body, "approve") || "APPROVED".equalsIgnoreCase(str(body, "status"));
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
        notifyEmployee(e, "Leave " + req.getStatus().toLowerCase(),
                "Your " + req.getLeaveType() + " leave (" + req.getFromDate() + " to " + req.getToDate() + ") was "
                        + req.getStatus().toLowerCase() + ".");
        return leaveView(req, List.of(e));
    }

    @Transactional
    public Map<String, Object> cancelLeave(UUID id) {
        requireEss();
        LeaveRequest req = store.getOwned(LeaveRequest.class, id, orgId());
        if (!"PENDING".equals(req.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only pending leave can be cancelled");
        }
        Employee e = store.getOwned(Employee.class, req.getEmployeeId(), orgId());
        requireOwnOrAdmin(e);
        req.setStatus("CANCELLED");
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
        boolean admin = hrAdmin();
        return store.list(Payslip.class, orgId()).stream()
                .filter(p -> ids.contains(p.getEmployeeId()))
                .filter(p -> admin || "PUBLISHED".equalsIgnoreCase(blank(p.getStatus(), "")))
                .map(p -> payslipView(p, visible, false))
                .toList();
    }

    public Map<String, Object> payslip(UUID id) {
        requireEss();
        Payslip p = store.getOwned(Payslip.class, id, orgId());
        Employee e = store.getOwned(Employee.class, p.getEmployeeId(), orgId());
        requireOwnOrAdmin(e);
        if (!hrAdmin() && !"PUBLISHED".equalsIgnoreCase(blank(p.getStatus(), ""))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This payslip is not published yet");
        }
        return payslipView(p, List.of(e), true);
    }

    @Transactional
    public Map<String, Object> publishPayslip(UUID id) {
        requireEss();
        requireHrAdmin();
        Payslip p = store.getOwned(Payslip.class, id, orgId());
        p.setStatus("PUBLISHED");
        p.setPaidAt(Instant.now());
        p = store.save(p);
        Employee e = store.getOwned(Employee.class, p.getEmployeeId(), orgId());
        notifyEmployee(e, "Payslip published",
                "Your payslip for " + p.getPayMonth() + "/" + p.getPayYear() + " is ready. Open ESS → Payroll to view.");
        return payslipView(p, List.of(e), true);
    }

    public Map<String, Object> payrollSettingsView() {
        requireEss();
        requireHrAdmin();
        return settingsView(payrollSettings());
    }

    @Transactional
    public Map<String, Object> savePayrollSettings(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        PayrollSettings s = payrollSettings();
        if (body.containsKey("pfEnabled")) {
            s.setPfEnabled(bool(body, "pfEnabled"));
        }
        if (body.containsKey("pfRate")) {
            s.setPfRate(money(body, "pfRate"));
        }
        if (body.containsKey("pfWageCap")) {
            s.setPfWageCap(money(body, "pfWageCap"));
        }
        if (body.containsKey("esiEnabled")) {
            s.setEsiEnabled(bool(body, "esiEnabled"));
        }
        if (body.containsKey("esiEmployeeRate")) {
            s.setEsiEmployeeRate(money(body, "esiEmployeeRate"));
        }
        if (body.containsKey("esiEmployerRate")) {
            s.setEsiEmployerRate(money(body, "esiEmployerRate"));
        }
        if (body.containsKey("esiWageCap")) {
            s.setEsiWageCap(money(body, "esiWageCap"));
        }
        if (body.containsKey("ptEnabled")) {
            s.setPtEnabled(bool(body, "ptEnabled"));
        }
        if (body.containsKey("ptAmount")) {
            s.setPtAmount(money(body, "ptAmount"));
        }
        if (body.containsKey("tdsEnabled")) {
            s.setTdsEnabled(bool(body, "tdsEnabled"));
        }
        if (body.containsKey("tdsRate")) {
            s.setTdsRate(money(body, "tdsRate"));
        }
        if (body.containsKey("lopEnabled")) {
            s.setLopEnabled(bool(body, "lopEnabled"));
        }
        s = store.save(s);
        return settingsView(s);
    }

    public List<Map<String, Object>> previewPayroll(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        int year = integer(body, "year", LocalDate.now().getYear());
        int month = integer(body, "month", LocalDate.now().getMonthValue());
        PayrollSettings settings = payrollSettings();
        List<Employee> staff = activeEmployees();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : staff) {
            SalaryStructure structure = salaryStructure(e);
            if (structure == null) {
                continue;
            }
            boolean exists = payslipExists(e.getId(), year, month);
            Payslip draft = computePayslip(e, structure, year, month, settings);
            Map<String, Object> row = payslipView(draft, List.of(e), false);
            row.put("exists", exists);
            row.put("skipped", exists);
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> statutorySummary(int year, int month) {
        requireEss();
        requireHrAdmin();
        List<Payslip> slips = payslipsForPeriod(year, month);
        BigDecimal pfEmp = BigDecimal.ZERO;
        BigDecimal pfEr = BigDecimal.ZERO;
        BigDecimal esiEmp = BigDecimal.ZERO;
        BigDecimal esiEr = BigDecimal.ZERO;
        BigDecimal pt = BigDecimal.ZERO;
        BigDecimal tds = BigDecimal.ZERO;
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal net = BigDecimal.ZERO;
        BigDecimal lop = BigDecimal.ZERO;
        for (Payslip p : slips) {
            pfEmp = pfEmp.add(nz(p.getPfEmployee()));
            pfEr = pfEr.add(nz(p.getPfEmployer()));
            esiEmp = esiEmp.add(nz(p.getEsiEmployee()));
            esiEr = esiEr.add(nz(p.getEsiEmployer()));
            pt = pt.add(nz(p.getPtEmployee()));
            tds = tds.add(nz(p.getTdsEmployee()));
            gross = gross.add(nz(p.getGross()));
            net = net.add(nz(p.getNet()));
            lop = lop.add(nz(p.getLopDeduction()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", year);
        out.put("month", month);
        out.put("employeeCount", slips.size());
        out.put("publishedCount", slips.stream().filter(p -> "PUBLISHED".equalsIgnoreCase(blank(p.getStatus(), ""))).count());
        out.put("draftCount", slips.stream().filter(p -> "DRAFT".equalsIgnoreCase(blank(p.getStatus(), ""))).count());
        out.put("totalGross", gross);
        out.put("totalNet", net);
        out.put("totalPfEmployee", pfEmp);
        out.put("totalPfEmployer", pfEr);
        out.put("totalEsiEmployee", esiEmp);
        out.put("totalEsiEmployer", esiEr);
        out.put("totalPt", pt);
        out.put("totalTds", tds);
        out.put("totalLop", lop);
        return out;
    }

    public List<Map<String, Object>> payrollRegister(int year, int month) {
        requireEss();
        requireHrAdmin();
        List<Employee> all = store.list(Employee.class, orgId());
        return payslipsForPeriod(year, month).stream()
                .map(p -> {
                    Employee e = all.stream().filter(x -> x.getId().equals(p.getEmployeeId())).findFirst().orElse(null);
                    Map<String, Object> row = payslipView(p, e == null ? List.of() : List.of(e), false);
                    row.put("pan", e == null ? "" : parseCustom(e.getCustomJson()).getOrDefault("pan", ""));
                    row.put("uan", e == null ? "" : parseCustom(e.getCustomJson()).getOrDefault("uan", ""));
                    row.put("bankAccount", e == null ? "" : parseCustom(e.getCustomJson()).getOrDefault("bankAccount", ""));
                    return row;
                })
                .toList();
    }

    @Transactional
    public Map<String, Object> bulkPublishPayroll(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        int year = integer(body, "year", LocalDate.now().getYear());
        int month = integer(body, "month", LocalDate.now().getMonthValue());
        int published = 0;
        for (Payslip p : payslipsForPeriod(year, month)) {
            if (!"DRAFT".equalsIgnoreCase(blank(p.getStatus(), ""))) {
                continue;
            }
            p.setStatus("PUBLISHED");
            p.setPaidAt(Instant.now());
            store.save(p);
            Employee e = store.getOwned(Employee.class, p.getEmployeeId(), orgId());
            notifyEmployee(e, "Payslip published",
                    "Your payslip for " + month + "/" + year + " is ready. Open ESS → Payroll to view.");
            published++;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("published", published);
        out.put("year", year);
        out.put("month", month);
        return out;
    }

    @Transactional
    public List<Map<String, Object>> runPayroll(Map<String, Object> body) {
        requireEss();
        requireHrAdmin();
        int year = integer(body, "year", LocalDate.now().getYear());
        int month = integer(body, "month", LocalDate.now().getMonthValue());
        PayrollSettings settings = payrollSettings();
        List<Employee> staff = activeEmployees();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Employee e : staff) {
            if (payslipExists(e.getId(), year, month)) {
                continue;
            }
            SalaryStructure s = salaryStructure(e);
            if (s == null) {
                continue;
            }
            Payslip p = computePayslip(e, s, year, month, settings);
            p = store.save(p);
            compensation.markCommissionsPaid(orgId(), e.getId(), year, month);
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
        mergeHrJson(e, body);
    }

    private void applySelfProfile(Employee e, Map<String, Object> body) {
        if (body.containsKey("phone")) {
            e.setPhone(Phones.normalize(str(body, "phone")));
        }
        if (body.containsKey("email")) {
            e.setEmail(str(body, "email").toLowerCase());
        }
        Map<String, Object> patch = new LinkedHashMap<>();
        for (String key : HR_JSON_KEYS) {
            if (body.containsKey(key)) {
                patch.put(key, str(body, key));
            }
        }
        if (!patch.isEmpty()) {
            mergeHrJson(e, patch);
        }
    }

    private void seedBalance(Employee e) {
        int year = LocalDate.now().getYear();
        boolean exists = store.listBy(LeaveBalance.class, e.getOrganizationId(), "employeeId", e.getId()).stream()
                .anyMatch(b -> yearEquals(b.getLeaveYear(), year));
        if (exists) {
            return;
        }
        LeavePolicy policy = policyFor(year, e.getOrganizationId());
        LeaveBalance b = new LeaveBalance();
        b.setOrganizationId(e.getOrganizationId());
        b.setEmployeeId(e.getId());
        b.setLeaveYear(year);
        b.setCl(policy != null ? policy.getClAnnual() : CL_DEFAULT);
        b.setSl(policy != null ? policy.getSlAnnual() : SL_DEFAULT);
        b.setEl(policy != null ? policy.getElAnnual() : EL_DEFAULT);
        store.save(b);
    }

    private LeaveBalance balanceFor(Employee e, int year) {
        return store.listBy(LeaveBalance.class, e.getOrganizationId(), "employeeId", e.getId()).stream()
                .filter(b -> yearEquals(b.getLeaveYear(), year))
                .findFirst()
                .orElseGet(() -> {
                    LeavePolicy policy = policyFor(year, e.getOrganizationId());
                    LeaveBalance b = new LeaveBalance();
                    b.setOrganizationId(e.getOrganizationId());
                    b.setEmployeeId(e.getId());
                    b.setLeaveYear(year);
                    b.setCl(policy != null ? policy.getClAnnual() : CL_DEFAULT);
                    b.setSl(policy != null ? policy.getSlAnnual() : SL_DEFAULT);
                    b.setEl(policy != null ? policy.getElAnnual() : EL_DEFAULT);
                    return store.save(b);
                });
    }

    private LeavePolicy policyFor(int year, UUID org) {
        return store.list(LeavePolicy.class, org).stream()
                .filter(p -> yearEquals(p.getLeaveYear(), year))
                .findFirst()
                .orElse(null);
    }

    private LeavePolicy policyFor(int year) {
        return policyFor(year, orgId());
    }

    private List<Employee> teamMembers() {
        if (hrAdmin()) {
            return store.list(Employee.class, orgId());
        }
        Employee me = selfEmployee(true);
        List<Employee> all = store.list(Employee.class, orgId());
        List<Employee> team = new ArrayList<>();
        team.add(me);
        all.stream().filter(e -> me.getId().equals(e.getManagerId())).forEach(team::add);
        return team;
    }

    private void upsertAttendance(Employee e, AttendanceRegularization reg) {
        StaffAttendance rec = store.listBy(StaffAttendance.class, orgId(), "employeeId", e.getId()).stream()
                .filter(a -> reg.getWorkDate().equals(a.getWorkDate())
                        && reg.getShift().equalsIgnoreCase(blank(a.getShift(), "FULL")))
                .findFirst()
                .orElseGet(StaffAttendance::new);
        rec.setOrganizationId(orgId());
        rec.setEmployeeId(e.getId());
        rec.setWorkDate(reg.getWorkDate());
        rec.setShift(reg.getShift());
        rec.setStatus(reg.getRequestedStatus());
        rec.setSource("REGULARIZATION");
        rec.setInTime(reg.getInTime());
        rec.setOutTime(reg.getOutTime());
        store.save(rec);
    }

    private void notifyApproval(String subject, String body) {
        InboxMessage msg = new InboxMessage();
        msg.setOrganizationId(orgId());
        msg.setFromName("ESS");
        msg.setSubject(subject);
        msg.setBody(body);
        msg.setStatus("UNREAD");
        store.save(msg);
    }

    private void notifyEmployee(Employee e, String subject, String body) {
        InboxMessage msg = new InboxMessage();
        msg.setOrganizationId(orgId());
        msg.setFromName("ESS");
        msg.setSubject(subject + " — " + e.getFullName());
        msg.setBody(body);
        msg.setStatus("UNREAD");
        store.save(msg);
    }

    private Map<String, Object> regView(AttendanceRegularization r, List<Employee> staff) {
        Employee subject = staff.stream()
                .filter(e -> e.getId().equals(r.getEmployeeId()))
                .findFirst()
                .orElseGet(() -> store.getOwned(Employee.class, r.getEmployeeId(), orgId()));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("employeeId", r.getEmployeeId());
        row.put("employeeName", subject.getFullName());
        row.put("workDate", r.getWorkDate());
        row.put("shift", r.getShift());
        row.put("requestedStatus", r.getRequestedStatus());
        row.put("inTime", r.getInTime());
        row.put("outTime", r.getOutTime());
        row.put("reason", r.getReason());
        row.put("status", r.getStatus());
        row.put("canApprove", canApproveLeaveFor(subject));
        Employee me = selfEmployee(false);
        row.put("canCancel", "PENDING".equals(r.getStatus()) && me != null && me.getId().equals(r.getEmployeeId()));
        return row;
    }

    private Map<String, Object> resignView(ResignationRequest r, List<Employee> staff) {
        Employee subject = staff.stream()
                .filter(e -> e.getId().equals(r.getEmployeeId()))
                .findFirst()
                .orElseGet(() -> store.getOwned(Employee.class, r.getEmployeeId(), orgId()));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("employeeId", r.getEmployeeId());
        row.put("employeeName", subject.getFullName());
        row.put("lastWorkingDate", r.getLastWorkingDate());
        row.put("reason", r.getReason());
        row.put("status", r.getStatus());
        row.put("canDecide", hrAdmin() && "PENDING".equals(r.getStatus()));
        return row;
    }

    private Map<String, Object> docView(EmployeeDocument d) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", d.getId());
        row.put("employeeId", d.getEmployeeId());
        row.put("docType", d.getDocType());
        row.put("fileName", d.getFileName());
        row.put("storageUrl", d.getStorageUrl());
        return row;
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

    private PayrollSettings payrollSettings() {
        return payrollSettings(orgId());
    }

    private PayrollSettings payrollSettings(UUID org) {
        return store.list(PayrollSettings.class, org).stream()
                .findFirst()
                .orElseGet(() -> {
                    PayrollSettings s = new PayrollSettings();
                    s.setOrganizationId(org);
                    return store.save(s);
                });
    }

    private Map<String, Object> settingsView(PayrollSettings s) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", s.getId());
        row.put("pfEnabled", s.getPfEnabled());
        row.put("pfRate", s.getPfRate());
        row.put("pfWageCap", s.getPfWageCap());
        row.put("esiEnabled", s.getEsiEnabled());
        row.put("esiEmployeeRate", s.getEsiEmployeeRate());
        row.put("esiEmployerRate", s.getEsiEmployerRate());
        row.put("esiWageCap", s.getEsiWageCap());
        row.put("ptEnabled", s.getPtEnabled());
        row.put("ptAmount", s.getPtAmount());
        row.put("tdsEnabled", s.getTdsEnabled());
        row.put("tdsRate", s.getTdsRate());
        row.put("lopEnabled", s.getLopEnabled());
        return row;
    }

    private List<Employee> activeEmployees() {
        return store.list(Employee.class, orgId()).stream()
                .filter(e -> "ACTIVE".equalsIgnoreCase(blank(e.getStatus(), "ACTIVE"))
                        || "ON_NOTICE".equalsIgnoreCase(blank(e.getStatus(), "")))
                .toList();
    }

    private SalaryStructure salaryStructure(Employee e) {
        return store.listBy(SalaryStructure.class, orgId(), "employeeId", e.getId()).stream()
                .findFirst()
                .orElse(null);
    }

    private boolean payslipExists(UUID employeeId, int year, int month) {
        return store.listBy(Payslip.class, orgId(), "employeeId", employeeId).stream()
                .anyMatch(p -> yearEquals(p.getPayYear(), year) && yearEquals(p.getPayMonth(), month));
    }

    private List<Payslip> payslipsForPeriod(int year, int month) {
        return store.list(Payslip.class, orgId()).stream()
                .filter(p -> yearEquals(p.getPayYear(), year) && yearEquals(p.getPayMonth(), month))
                .toList();
    }

    private Payslip computePayslip(Employee e, SalaryStructure s, int year, int month, PayrollSettings settings) {
        return buildPayslip(e, s, year, month, settings);
    }

    private Payslip buildPayslip(Employee e, SalaryStructure s, int year, int month) {
        return buildPayslip(e, s, year, month, payrollSettings(e.getOrganizationId()));
    }

    private Payslip buildPayslip(Employee e, SalaryStructure s, int year, int month, PayrollSettings cfg) {
        BigDecimal basic = nz(s.getBasic());
        BigDecimal hra = nz(s.getHra());
        BigDecimal special = nz(s.getSpecial());
        BigDecimal variablePay = compensation.facultyVariablePay(e.getOrganizationId(), e, year, month);
        BigDecimal commissionPay = compensation.commissionForPayroll(e.getOrganizationId(), e.getId(), year, month);
        BigDecimal gross = basic.add(hra).add(special).add(variablePay).add(commissionPay);

        YearMonth ym = YearMonth.of(year, month);
        int workingDays = weekdaysInMonth(ym);
        AttendanceSummary att = attendanceSummaryFor(e.getId(), ym);
        int presentDays = att.presentDays();
        BigDecimal lopDays = att.lopDays();
        BigDecimal lopDeduction = BigDecimal.ZERO;
        if (Boolean.TRUE.equals(cfg.getLopEnabled()) && lopDays.signum() > 0 && workingDays > 0) {
            lopDeduction = gross.multiply(lopDays)
                    .divide(BigDecimal.valueOf(workingDays), 2, RoundingMode.HALF_UP);
            gross = gross.subtract(lopDeduction).max(BigDecimal.ZERO);
        }

        BigDecimal pf = BigDecimal.ZERO;
        BigDecimal pfEr = BigDecimal.ZERO;
        if (Boolean.TRUE.equals(cfg.getPfEnabled())) {
            BigDecimal cap = nz(cfg.getPfWageCap()).signum() > 0 ? cfg.getPfWageCap() : PF_WAGE_CAP;
            BigDecimal rate = nz(cfg.getPfRate()).signum() > 0 ? cfg.getPfRate() : PF_RATE;
            BigDecimal pfBase = basic.min(cap);
            pf = pfBase.multiply(rate).setScale(2, RoundingMode.HALF_UP);
            pfEr = pf;
        }

        BigDecimal esiEmp = BigDecimal.ZERO;
        BigDecimal esiEr = BigDecimal.ZERO;
        if (Boolean.TRUE.equals(cfg.getEsiEnabled())) {
            BigDecimal cap = nz(cfg.getEsiWageCap()).signum() > 0 ? cfg.getEsiWageCap() : ESI_WAGE_CAP;
            if (gross.compareTo(cap) <= 0) {
                BigDecimal empRate = nz(cfg.getEsiEmployeeRate()).signum() > 0 ? cfg.getEsiEmployeeRate() : ESI_EMPLOYEE;
                BigDecimal erRate = nz(cfg.getEsiEmployerRate()).signum() > 0 ? cfg.getEsiEmployerRate() : ESI_EMPLOYER;
                esiEmp = gross.multiply(empRate).setScale(2, RoundingMode.HALF_UP);
                esiEr = gross.multiply(erRate).setScale(2, RoundingMode.HALF_UP);
            }
        }

        BigDecimal pt = Boolean.TRUE.equals(cfg.getPtEnabled()) ? nz(cfg.getPtAmount()) : BigDecimal.ZERO;
        BigDecimal tds = BigDecimal.ZERO;
        if (Boolean.TRUE.equals(cfg.getTdsEnabled()) && nz(cfg.getTdsRate()).signum() > 0) {
            tds = gross.multiply(cfg.getTdsRate()).setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal deductions = pf.add(esiEmp).add(pt).add(tds);
        Payslip p = new Payslip();
        p.setOrganizationId(e.getOrganizationId());
        p.setEmployeeId(e.getId());
        p.setPayYear(year);
        p.setPayMonth(month);
        p.setBasic(basic);
        p.setHra(hra);
        p.setSpecial(special);
        p.setVariablePay(variablePay);
        p.setCommissionPay(commissionPay);
        p.setGross(basic.add(hra).add(special).add(variablePay).add(commissionPay));
        p.setLopDays(lopDays);
        p.setLopDeduction(lopDeduction);
        p.setPfEmployee(pf);
        p.setEsiEmployee(esiEmp);
        p.setPfEmployer(pfEr);
        p.setEsiEmployer(esiEr);
        p.setPtEmployee(pt);
        p.setTdsEmployee(tds);
        p.setDeductions(deductions.add(lopDeduction));
        p.setNet(gross.subtract(pf.add(esiEmp).add(pt).add(tds)).max(BigDecimal.ZERO));
        p.setWorkingDays(workingDays);
        p.setPresentDays(presentDays);
        p.setStatus("DRAFT");
        return p;
    }

    private record AttendanceSummary(int presentDays, BigDecimal lopDays) {}

    private AttendanceSummary attendanceSummaryFor(UUID employeeId, YearMonth ym) {
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth();
        BigDecimal lop = BigDecimal.ZERO;
        int present = 0;
        for (StaffAttendance a : store.listBy(StaffAttendance.class, orgId(), "employeeId", employeeId)) {
            if (a.getWorkDate() == null || a.getWorkDate().isBefore(start) || a.getWorkDate().isAfter(end)) {
                continue;
            }
            if (!isWeekday(a.getWorkDate())) {
                continue;
            }
            String status = upper(blank(a.getStatus(), ""), "");
            if ("ABSENT".equals(status)) {
                lop = lop.add(BigDecimal.ONE);
            } else if ("HALF".equals(status)) {
                lop = lop.add(new BigDecimal("0.5"));
                present++;
            } else if ("PRESENT".equals(status) || "LATE".equals(status)) {
                present++;
            }
        }
        return new AttendanceSummary(present, lop);
    }

    private static int weekdaysInMonth(YearMonth ym) {
        int count = 0;
        for (LocalDate d = ym.atDay(1); !d.isAfter(ym.atEndOfMonth()); d = d.plusDays(1)) {
            if (isWeekday(d)) {
                count++;
            }
        }
        return count;
    }

    private static boolean isWeekday(LocalDate d) {
        int dow = d.getDayOfWeek().getValue();
        return dow >= 1 && dow <= 5;
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
        Set<UUID> ids = new HashSet<>();
        ids.add(me.getId());
        if (leaveApprover()) {
            all.stream()
                    .filter(e -> me.getId().equals(e.getManagerId()))
                    .map(Employee::getId)
                    .forEach(ids::add);
        }
        return all.stream().filter(e -> ids.contains(e.getId())).toList();
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
        if (Roles.OWNER.equals(role) || Roles.ACCOUNTANT.equals(role)) {
            return true;
        }
        return Access.hasCap(Auth.current(), Packs.CAP_ESS_MANAGE);
    }

    private boolean leaveApprover() {
        return Access.hasCap(Auth.current(), Packs.CAP_LEAVE_APPROVE);
    }

    private boolean canApproveLeaveFor(Employee target) {
        if (hrAdmin()) {
            return true;
        }
        if (!leaveApprover()) {
            return false;
        }
        Employee me = selfEmployee(false);
        return me != null && me.getId().equals(target.getManagerId());
    }

    private void requireProfileAccess(Employee e) {
        if (hrAdmin()) {
            return;
        }
        Employee me = selfEmployee(false);
        if (me != null && me.getId().equals(e.getId())) {
            return;
        }
        if (me != null && leaveApprover() && me.getId().equals(e.getManagerId())) {
            return;
        }
        throw new ApiException(HttpStatus.FORBIDDEN, "You cannot view this employee profile");
    }

    private Map<String, Object> holidayView(InstituteHoliday h) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", h.getId());
        row.put("name", h.getName());
        row.put("holidayDate", h.getHolidayDate());
        row.put("centerId", h.getCenterId());
        return row;
    }

    private Map<String, Object> parseCustom(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return JSON.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private void mergeHrJson(Employee e, Map<String, Object> body) {
        boolean touched = false;
        Map<String, Object> current = parseCustom(e.getCustomJson());
        for (String key : HR_JSON_KEYS) {
            if (body.containsKey(key)) {
                current.put(key, str(body, key));
                touched = true;
            }
        }
        if (!touched) {
            return;
        }
        try {
            e.setCustomJson(JSON.writeValueAsString(current));
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Could not save employee HR details");
        }
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
        Map<String, Object> hr = parseCustom(e.getCustomJson());
        for (String key : HR_JSON_KEYS) {
            row.put(key, hr.getOrDefault(key, ""));
        }
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
        row.put("workDate", a.getWorkDate() == null ? null : a.getWorkDate().toString());
        row.put("shift", a.getShift());
        row.put("status", a.getStatus());
        row.put("source", a.getSource());
        row.put("inTime", a.getInTime() == null ? null : a.getInTime().toString());
        row.put("outTime", a.getOutTime() == null ? null : a.getOutTime().toString());
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
        Employee subject = staff.stream()
                .filter(e -> e.getId().equals(r.getEmployeeId()))
                .findFirst()
                .orElseGet(() -> store.getOwned(Employee.class, r.getEmployeeId(), orgId()));
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("employeeId", r.getEmployeeId());
        row.put("employeeName", subject.getFullName());
        row.put("leaveType", r.getLeaveType());
        row.put("fromDate", r.getFromDate());
        row.put("toDate", r.getToDate());
        row.put("days", r.getDays());
        row.put("reason", r.getReason());
        row.put("status", r.getStatus());
        row.put("decidedAt", r.getDecidedAt());
        row.put("canApprove", canApproveLeaveFor(subject));
        Employee me = selfEmployee(false);
        row.put("canCancel", "PENDING".equals(r.getStatus()) && me != null && me.getId().equals(r.getEmployeeId()));
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
        row.put("variablePay", p.getVariablePay());
        row.put("commissionPay", p.getCommissionPay());
        row.put("gross", p.getGross());
        row.put("pfEmployee", p.getPfEmployee());
        row.put("esiEmployee", p.getEsiEmployee());
        row.put("pfEmployer", p.getPfEmployer());
        row.put("esiEmployer", p.getEsiEmployer());
        row.put("ptEmployee", p.getPtEmployee());
        row.put("tdsEmployee", p.getTdsEmployee());
        row.put("lopDays", p.getLopDays());
        row.put("lopDeduction", p.getLopDeduction());
        row.put("workingDays", p.getWorkingDays());
        row.put("presentDays", p.getPresentDays());
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
