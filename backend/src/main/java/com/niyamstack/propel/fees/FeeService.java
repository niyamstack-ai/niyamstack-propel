package com.niyamstack.propel.fees;

import com.niyamstack.propel.compensation.CompensationService;
import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.EventHook;
import com.niyamstack.propel.integration.MessagingGateway;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.integration.PaymentGateway;
import com.niyamstack.propel.catalog.Packs;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.Gstins;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class FeeService {
    private final Store store;
    private final PaymentGateway payments;
    private final MessagingGateway messaging;
    private final AuditService audit;
    private final EventHook hooks;
    private final CompensationService compensation;

    public FeeService(Store store, PaymentGateway payments, MessagingGateway messaging, AuditService audit, EventHook hooks,
                      CompensationService compensation) {
        this.store = store;
        this.payments = payments;
        this.messaging = messaging;
        this.audit = audit;
        this.hooks = hooks;
        this.compensation = compensation;
    }

    @Transactional
    public List<FeeInstallment> scheduleInstallments(UUID planId, UUID studentId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        FeePlan plan = store.getOwned(FeePlan.class, planId, user.organizationId());
        Student student = store.getOwned(Student.class, studentId, user.organizationId());
        int count = plan.getInstallmentCount() == null || plan.getInstallmentCount() < 1 ? 2 : plan.getInstallmentCount();
        BigDecimal each = plan.getTotalAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
        Organization org = store.get(Organization.class, user.organizationId());
        String series = OrgSecrets.live(org, "invoiceSeries");
        if (series.isBlank()) {
            series = "INV";
        }
        List<FeeInstallment> created = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            FeeInstallment inst = new FeeInstallment();
            inst.setOrganizationId(user.organizationId());
            inst.setFeePlanId(plan.getId());
            inst.setStudentId(student.getId());
            inst.setSeqNo(i);
            inst.setDueDate(LocalDate.now().plusMonths(i - 1));
            inst.setAmount(each);
            inst.setStatus("DUE");
            Invoice invoice = new Invoice();
            invoice.setOrganizationId(user.organizationId());
            invoice.setStudentId(student.getId());
            invoice.setFeePlanId(plan.getId());
            invoice.setCourseId(plan.getCourseId() != null ? plan.getCourseId() : student.getCourseId());
            invoice.setAmount(each);
            invoice.setBuyerName(student.getFullName());
            invoice.setSacCode(plan.getSacCode() == null || plan.getSacCode().isBlank() ? "999293" : plan.getSacCode());
            invoice.setSeriesPrefix(series);
            invoice.setPlaceOfSupply(OrgSecrets.live(org, "gstState"));
            applyGst(invoice, plan, org);
            invoice.setInvoiceNo(nextInvoiceNo(org));
            invoice.setStatus("DUE");
            invoice.setDueDate(inst.getDueDate());
            invoice.setPaidAmount(BigDecimal.ZERO);
            invoice = store.save(invoice);
            inst.setInvoiceId(invoice.getId());
            created.add(store.save(inst));
        }
        audit.log("FEE_SCHEDULE", "FeePlan", plan.getId(), "student=" + student.getStudentCode());
        return created;
    }

    @Transactional
    public List<FeeInstallment> scheduleDefaultForStudent(UUID studentId, UUID courseId, UUID batchId) {
        PropelUser user = Auth.current();
        UUID org = user.organizationId();
        FeePlan plan = findFeePlan(org, courseId, batchId);
        if (plan == null) {
            return List.of();
        }
        boolean exists = store.list(FeeInstallment.class, org).stream()
                .anyMatch(i -> studentId.equals(i.getStudentId()) && plan.getId().equals(i.getFeePlanId()));
        if (exists) {
            return List.of();
        }
        return scheduleInstallments(plan.getId(), studentId);
    }

    private FeePlan findFeePlan(UUID org, UUID courseId, UUID batchId) {
        List<FeePlan> plans = store.list(FeePlan.class, org);
        if (batchId != null) {
            FeePlan byBatch = plans.stream().filter(p -> batchId.equals(p.getBatchId())).findFirst().orElse(null);
            if (byBatch != null) {
                return byBatch;
            }
        }
        if (courseId != null) {
            return plans.stream().filter(p -> courseId.equals(p.getCourseId())).findFirst().orElse(null);
        }
        return null;
    }

    @Transactional
    public Map<String, Object> collect(UUID invoiceId, BigDecimal amount, String method) {
        return collect(invoiceId, amount, method, null);
    }

    @Transactional
    public Map<String, Object> collect(UUID invoiceId, BigDecimal amount, String method, String reference) {
        PropelUser user = Auth.current();
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, user.organizationId());
        if (Roles.STUDENT.equals(user.role())) {
            Student me = store.listBy(Student.class, user.organizationId(), "userId", user.userId())
                    .stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "No student profile"));
            if (!me.getId().equals(invoice.getStudentId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You can only pay your own fees");
            }
            if (isOffline(method)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Ask the institute to record cash or cheque");
            }
        } else {
            Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        }
        if ("PAID".equals(invoice.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invoice already paid");
        }
        BigDecimal payAmt = amount == null ? invoice.getAmount().subtract(nvl(invoice.getPaidAmount())) : amount;
        if (payAmt.signum() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Amount must be positive");
        }
        UUID orgId = user.organizationId();
        Organization org = store.get(Organization.class, orgId);
        if (isOffline(method)) {
            if (Roles.STUDENT.equals(user.role())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Ask the institute to record cash or cheque");
            }
            String ref = (reference == null || reference.isBlank()) ? "OFFLINE-" + Instant.now().toEpochMilli() : reference.trim();
            Payment payment = capture(org, invoice, payAmt, normalizeMethod(method), ref);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("checkout", false);
            out.put("offline", true);
            out.put("status", payment.getStatus());
            out.put("method", payment.getMethod());
            out.put("gatewayRef", payment.getGatewayRef());
            out.put("receiptNo", payment.getReceiptNo());
            return out;
        }
        if (payments.live(orgId)) {
            PaymentGateway.ChargeResult order = payments.createOrder(orgId, payAmt, invoice.getInvoiceNo(),
                    Map.of("invoiceId", invoice.getId().toString(), "orgId", orgId.toString()));
            Payment payment = pendingPayment(orgId, invoice.getId(), payAmt, method, order.gatewayRef());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("checkout", true);
            out.put("keyId", payments.publicKey(orgId));
            out.put("orderId", order.gatewayRef());
            out.put("amountPaise", payAmt.multiply(BigDecimal.valueOf(100)).longValue());
            out.put("currency", "INR");
            out.put("name", org.getName());
            out.put("invoiceId", invoice.getId());
            out.put("paymentId", payment.getId());
            return out;
        }
        PaymentGateway.ChargeResult charge = payments.charge(orgId, payAmt, method, invoice.getInvoiceNo());
        Payment payment = capture(org, invoice, payAmt, method == null ? "UPI" : method, charge.gatewayRef());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("checkout", false);
        out.put("status", payment.getStatus());
        out.put("gatewayRef", payment.getGatewayRef());
        out.put("receiptNo", payment.getReceiptNo());
        return out;
    }

    @Transactional
    public Map<String, Object> confirmCheckout(UUID invoiceId, String orderId, String razorpayPaymentId, String signature) {
        PropelUser user = Auth.current();
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, user.organizationId());
        return captureVerified(user.organizationId(), invoice, orderId, razorpayPaymentId, signature);
    }

    @Transactional
    public Map<String, Object> captureVerified(UUID orgId, Invoice invoice, String orderId, String razorpayPaymentId, String signature) {
        if (!payments.verifyCheckout(orgId, orderId, razorpayPaymentId, signature)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Payment signature did not match. The fee was not marked paid.");
        }
        if ("PAID".equals(invoice.getStatus())) {
            return Map.of("status", "PAID", "alreadyPaid", true);
        }
        Organization org = store.get(Organization.class, orgId);
        BigDecimal payAmt = invoice.getAmount().subtract(nvl(invoice.getPaidAmount()));
        Payment pending = store.listBy(Payment.class, orgId, "invoiceId", invoice.getId()).stream()
                .filter(p -> "PENDING".equals(p.getStatus()) && (orderId == null || orderId.equals(p.getGatewayRef())))
                .findFirst()
                .orElse(null);
        if (pending != null) {
            pending.setGatewayRef(razorpayPaymentId);
            pending.setStatus("CAPTURED");
            pending.setReceivedAt(Instant.now());
            store.save(pending);
            invoice.setPaidAmount(nvl(invoice.getPaidAmount()).add(pending.getAmount()));
            invoice.setStatus(invoice.getPaidAmount().compareTo(invoice.getAmount()) >= 0 ? "PAID" : "PARTIAL");
            store.save(invoice);
            compensation.accrueOnFeeCollected(orgId, pending, invoice.getStudentId());
            finishPaid(org, invoice, pending);
            return Map.of("status", invoice.getStatus(), "gatewayRef", razorpayPaymentId);
        }
        Payment payment = capture(org, invoice, payAmt, "UPI", razorpayPaymentId);
        return Map.of("status", invoice.getStatus(), "gatewayRef", payment.getGatewayRef());
    }

    @Transactional
    public void captureFromWebhook(UUID orgId, UUID invoiceId, String orderId, String razorpayPaymentId) {
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, orgId);
        if ("PAID".equals(invoice.getStatus())) {
            return;
        }
        Organization org = store.get(Organization.class, orgId);
        Payment pending = store.listBy(Payment.class, orgId, "invoiceId", invoice.getId()).stream()
                .filter(p -> "PENDING".equals(p.getStatus()))
                .findFirst()
                .orElse(null);
        if (pending != null) {
            pending.setGatewayRef(razorpayPaymentId == null ? orderId : razorpayPaymentId);
            pending.setStatus("CAPTURED");
            pending.setReceivedAt(Instant.now());
            store.save(pending);
            invoice.setPaidAmount(nvl(invoice.getPaidAmount()).add(pending.getAmount()));
            invoice.setStatus(invoice.getPaidAmount().compareTo(invoice.getAmount()) >= 0 ? "PAID" : "PARTIAL");
            store.save(invoice);
            compensation.accrueOnFeeCollected(orgId, pending, invoice.getStudentId());
            finishPaid(org, invoice, pending);
            return;
        }
        BigDecimal payAmt = invoice.getAmount().subtract(nvl(invoice.getPaidAmount()));
        if (payAmt.signum() > 0) {
            capture(org, invoice, payAmt, "UPI", razorpayPaymentId == null ? orderId : razorpayPaymentId);
        }
    }

    @Transactional
    public Refund requestRefund(UUID paymentId, BigDecimal amount, String reason) {
        PropelUser user = Auth.current();
        Access.requireAnyModule(user, Packs.MOD_FEES);
        if (!Roles.OWNER.equals(user.role()) && !Roles.ACCOUNTANT.equals(user.role()) && !Access.hasCap(user, Packs.CAP_REFUND)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "This role cannot refund");
        }
        Payment payment = store.getOwned(Payment.class, paymentId, user.organizationId());
        Refund refund = new Refund();
        refund.setOrganizationId(user.organizationId());
        refund.setPaymentId(payment.getId());
        refund.setAmount(amount == null ? payment.getAmount() : amount);
        refund.setReason(reason);
        refund.setStatus("REQUESTED");
        refund.setRequestedBy(user.userId());
        refund = store.save(refund);
        audit.log("REFUND_REQUEST", "Refund", refund.getId(), reason);
        return refund;
    }

    @Transactional
    public Refund decideRefund(UUID refundId, boolean approve) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        Refund refund = store.getOwned(Refund.class, refundId, user.organizationId());
        if (!"REQUESTED".equals(refund.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Refund is not awaiting approval");
        }
        refund.setApprovedBy(user.userId());
        refund.setApprovedAt(Instant.now());
        refund.setStatus(approve ? "APPROVED" : "REJECTED");
        if (approve) {
            Payment payment = store.getOwned(Payment.class, refund.getPaymentId(), user.organizationId());
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), user.organizationId());
            invoice.setPaidAmount(nvl(invoice.getPaidAmount()).subtract(refund.getAmount()).max(BigDecimal.ZERO));
            invoice.setStatus(invoice.getPaidAmount().signum() == 0 ? "DUE" : "PARTIAL");
            store.save(invoice);
            String ref = payment.getGatewayRef();
            if (ref != null && ref.startsWith("pay_")) {
                String rz = payments.refundPayment(user.organizationId(), ref, refund.getAmount());
                refund.setGatewayRefundRef(rz);
            }
            refund.setCreditNoteNo(nextCreditNoteNo(store.get(Organization.class, user.organizationId())));
            Payment credit = new Payment();
            credit.setOrganizationId(user.organizationId());
            credit.setInvoiceId(invoice.getId());
            credit.setAmount(refund.getAmount() == null ? BigDecimal.ZERO : refund.getAmount().negate());
            credit.setMethod("CREDIT_NOTE");
            credit.setGatewayRef(refund.getCreditNoteNo());
            credit.setReceivedAt(Instant.now());
            credit.setStatus("REFUNDED");
            credit.setReceiptNo(refund.getCreditNoteNo());
            store.save(credit);
        }
        refund = store.save(refund);
        audit.log(approve ? "REFUND_APPROVE" : "REFUND_REJECT", "Refund", refund.getId(), null);
        return refund;
    }

    public List<Invoice> dues() {
        return store.list(Invoice.class, Auth.current().organizationId()).stream()
                .filter(i -> !"PAID".equals(i.getStatus()) && !"CANCELLED".equals(i.getStatus()))
                .toList();
    }

    public List<Map<String, Object>> ledger() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        UUID orgId = user.organizationId();
        Map<UUID, String> names = new LinkedHashMap<>();
        for (Student s : store.list(Student.class, orgId)) {
            names.put(s.getId(), s.getFullName());
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Invoice invoice : store.list(Invoice.class, orgId)) {
            rows.add(ledgerRow(invoice.getCreatedAt(), "INVOICE", invoice.getInvoiceNo(),
                    invoice.getAmount(), invoice.getStatus(), names.get(invoice.getStudentId()), invoice.getId(), null));
        }
        for (Payment payment : store.list(Payment.class, orgId)) {
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            rows.add(ledgerRow(payment.getReceivedAt(), paymentMethodKind(payment),
                    payment.getReceiptNo() == null ? payment.getGatewayRef() : payment.getReceiptNo(),
                    payment.getAmount(), payment.getStatus(), names.get(invoice.getStudentId()), invoice.getId(), payment.getId()));
        }
        for (Refund refund : store.list(Refund.class, orgId)) {
            Payment payment = store.getOwned(Payment.class, refund.getPaymentId(), orgId);
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            rows.add(ledgerRow(refund.getApprovedAt() == null ? refund.getCreatedAt() : refund.getApprovedAt(),
                    "REFUND", refund.getCreditNoteNo() == null ? refund.getStatus() : refund.getCreditNoteNo(),
                    refund.getAmount() == null ? BigDecimal.ZERO : refund.getAmount().negate(),
                    refund.getStatus(), names.get(invoice.getStudentId()), invoice.getId(), payment.getId()));
        }
        rows.sort((a, b) -> String.valueOf(b.get("at")).compareTo(String.valueOf(a.get("at"))));
        return rows;
    }

    public List<Map<String, Object>> reconciliation() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        UUID orgId = user.organizationId();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Payment payment : store.list(Payment.class, orgId)) {
            if (!"PENDING".equals(payment.getStatus()) && !isOffline(payment.getMethod()) && !"CREDIT_NOTE".equalsIgnoreCase(payment.getMethod())) {
                continue;
            }
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", payment.getId());
            row.put("invoiceId", invoice.getId());
            row.put("invoiceNo", invoice.getInvoiceNo());
            row.put("method", payment.getMethod());
            row.put("reference", payment.getGatewayRef());
            row.put("amount", payment.getAmount());
            row.put("status", payment.getStatus());
            row.put("receivedAt", payment.getReceivedAt());
            row.put("receiptNo", payment.getReceiptNo());
            rows.add(row);
        }
        return rows;
    }

    @Transactional
    public Map<String, Object> remindInvoice(UUID invoiceId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, user.organizationId());
        return remindOne(store.get(Organization.class, user.organizationId()), invoice, true);
    }

    @Transactional
    public int remindOverdue() {
        int sent = 0;
        for (Organization org : store.listOrganizations()) {
            sent += remindOrg(org);
        }
        return sent;
    }

    @Transactional
    public Map<String, Object> remindOrgDues() {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        int sent = remindOrg(store.get(Organization.class, user.organizationId()));
        return Map.of("sent", sent);
    }

    private int remindOrg(Organization org) {
        int sent = 0;
        for (Invoice invoice : store.list(Invoice.class, org.getId())) {
            if (!isOverdue(invoice)) {
                continue;
            }
            if (invoice.getLastRemindedAt() != null && invoice.getLastRemindedAt().isAfter(Instant.now().minusSeconds(20 * 3600))) {
                continue;
            }
            if (invoice.getStudentId() == null) {
                continue;
            }
            try {
                remindOne(org, invoice, false);
                sent++;
            } catch (Exception ex) {
                // Skip broken invoices so the scheduled pass does not abort the whole org.
            }
        }
        return sent;
    }

    public Map<String, Object> creditNote(UUID refundId) {
        PropelUser user = Auth.current();
        Refund refund = store.getOwned(Refund.class, refundId, user.organizationId());
        if (!"APPROVED".equals(refund.getStatus()) || refund.getCreditNoteNo() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Credit note is issued after the owner approves the refund");
        }
        Payment payment = store.getOwned(Payment.class, refund.getPaymentId(), user.organizationId());
        Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), user.organizationId());
        if (Roles.STUDENT.equals(user.role())) {
            List<Student> mine = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
            UUID studentId = mine.isEmpty() ? null : mine.getFirst().getId();
            if (studentId == null || !studentId.equals(invoice.getStudentId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Not your credit note");
            }
        } else {
            Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        }
        Organization org = store.get(Organization.class, user.organizationId());
        Student student = store.getOwned(Student.class, invoice.getStudentId(), user.organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("creditNoteNo", refund.getCreditNoteNo());
        out.put("amount", refund.getAmount());
        out.put("reason", refund.getReason());
        out.put("approvedAt", refund.getApprovedAt());
        out.put("invoiceNo", invoice.getInvoiceNo());
        out.put("instituteName", org.getName());
        out.put("instituteGstin", org.getGstin());
        out.put("buyerName", invoice.getBuyerName() == null ? student.getFullName() : invoice.getBuyerName());
        out.put("buyerGstin", invoice.getBuyerGstin());
        out.put("placeOfSupply", invoice.getPlaceOfSupply());
        out.put("sacCode", invoice.getSacCode());
        out.put("hsn", invoice.getHsn());
        BigDecimal[] tax = prorateTax(invoice, refund.getAmount());
        out.put("cgst", tax[0]);
        out.put("sgst", tax[1]);
        out.put("igst", tax[2]);
        out.put("gstRate", invoice.getGstRate());
        out.put("gatewayRefundRef", refund.getGatewayRefundRef());
        return out;
    }

    private Payment pendingPayment(UUID orgId, UUID invoiceId, BigDecimal amount, String method, String orderId) {
        Payment payment = new Payment();
        payment.setOrganizationId(orgId);
        payment.setInvoiceId(invoiceId);
        payment.setAmount(amount);
        payment.setMethod(method == null ? "UPI" : method);
        payment.setGatewayRef(orderId);
        payment.setReceivedAt(Instant.now());
        payment.setStatus("PENDING");
        return store.save(payment);
    }

    private Payment capture(Organization org, Invoice invoice, BigDecimal payAmt, String method, String gatewayRef) {
        Payment payment = new Payment();
        payment.setOrganizationId(org.getId());
        payment.setInvoiceId(invoice.getId());
        payment.setAmount(payAmt);
        payment.setMethod(method);
        payment.setGatewayRef(gatewayRef);
        payment.setReceivedAt(Instant.now());
        payment.setStatus("CAPTURED");
        String receiptNo = "RCPT-" + Instant.now().toEpochMilli();
        payment.setReceiptNo(receiptNo);
        payment = store.save(payment);
        invoice.setPaidAmount(nvl(invoice.getPaidAmount()).add(payAmt));
        invoice.setStatus(invoice.getPaidAmount().compareTo(invoice.getAmount()) >= 0 ? "PAID" : "PARTIAL");
        store.save(invoice);
        compensation.accrueOnFeeCollected(org.getId(), payment, invoice.getStudentId());
        finishPaid(org, invoice, payment);
        return payment;
    }

    private void finishPaid(Organization org, Invoice invoice, Payment payment) {
        if (payment.getReceiptNo() == null) {
            payment.setReceiptNo("RCPT-" + Instant.now().toEpochMilli());
            store.save(payment);
        }
        Receipt receipt = new Receipt();
        receipt.setOrganizationId(org.getId());
        receipt.setPaymentId(payment.getId());
        receipt.setInvoiceId(invoice.getId());
        receipt.setReceiptNo(payment.getReceiptNo());
        receipt.setAmount(payment.getAmount());
        receipt.setGstin(org.getGstin());
        receipt.setIssuedAt(Instant.now());
        store.save(receipt);
        Student billed = store.getOwned(Student.class, invoice.getStudentId(), org.getId());
        String to = billed.getPhone() != null && !billed.getPhone().isBlank() ? billed.getPhone() : billed.getEmail();
        var send = messaging.send(org.getId(), "WHATSAPP", to, "Fee receipt",
                "Receipt " + payment.getReceiptNo() + " for invoice " + invoice.getInvoiceNo());
        Notification n = new Notification();
        n.setOrganizationId(org.getId());
        n.setChannel("WHATSAPP");
        n.setAudience("student");
        n.setTitle("Fee receipt");
        n.setBody(send.message() + " — " + payment.getReceiptNo());
        n.setStatus(send.status());
        store.save(n);
        hooks.fire(org.getId(), "payment.captured", Map.of(
                "invoiceNo", invoice.getInvoiceNo(),
                "amount", payment.getAmount(),
                "receiptNo", payment.getReceiptNo()));
        audit.log("FEE_COLLECT", "Payment", payment.getId(), payment.getReceiptNo());
    }

    public List<Map<String, Object>> gstr1(LocalDate from, LocalDate to) {
        UUID orgId = Auth.current().organizationId();
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Invoice invoice : store.list(Invoice.class, orgId)) {
            if ("CANCELLED".equalsIgnoreCase(invoice.getStatus()) || invoice.getInvoiceNo() == null || invoice.getInvoiceNo().isBlank()) {
                continue;
            }
            if (invoice.getCreatedAt() == null) {
                continue;
            }
            LocalDate day = invoice.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate();
            if (from != null && day.isBefore(from)) {
                continue;
            }
            if (to != null && day.isAfter(to)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("docType", invoice.getBuyerGstin() == null || invoice.getBuyerGstin().isBlank() ? "B2C" : "B2B");
            row.put("invoiceNo", invoice.getInvoiceNo());
            row.put("date", day.toString());
            row.put("buyerGstin", invoice.getBuyerGstin() == null ? "" : invoice.getBuyerGstin());
            row.put("placeOfSupply", invoice.getPlaceOfSupply() == null ? "" : invoice.getPlaceOfSupply());
            row.put("taxable", invoice.getAmount());
            row.put("cgst", nvl(invoice.getCgst()));
            row.put("sgst", nvl(invoice.getSgst()));
            row.put("igst", nvl(invoice.getIgst()));
            row.put("sac", invoice.getSacCode());
            row.put("hsn", invoice.getHsn());
            row.put("status", invoice.getStatus());
            rows.add(row);
        }
        for (Refund refund : store.list(Refund.class, orgId)) {
            if (!"APPROVED".equals(refund.getStatus()) || refund.getCreditNoteNo() == null) {
                continue;
            }
            LocalDate day = refund.getApprovedAt() == null
                    ? LocalDate.now()
                    : refund.getApprovedAt().atZone(ZoneId.systemDefault()).toLocalDate();
            if (from != null && day.isBefore(from)) {
                continue;
            }
            if (to != null && day.isAfter(to)) {
                continue;
            }
            Payment payment = store.getOwned(Payment.class, refund.getPaymentId(), orgId);
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            BigDecimal[] tax = prorateTax(invoice, refund.getAmount());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("docType", "CDNR");
            row.put("invoiceNo", refund.getCreditNoteNo());
            row.put("date", day.toString());
            row.put("buyerGstin", invoice.getBuyerGstin() == null ? "" : invoice.getBuyerGstin());
            row.put("placeOfSupply", invoice.getPlaceOfSupply() == null ? "" : invoice.getPlaceOfSupply());
            row.put("taxable", refund.getAmount() == null ? BigDecimal.ZERO : refund.getAmount().negate());
            row.put("cgst", tax[0].negate());
            row.put("sgst", tax[1].negate());
            row.put("igst", tax[2].negate());
            row.put("sac", invoice.getSacCode());
            row.put("hsn", invoice.getHsn());
            row.put("status", "CREDIT_NOTE");
            rows.add(row);
        }
        return rows;
    }

    private void applyGst(Invoice invoice, FeePlan plan, Organization org) {
        BigDecimal rate = plan.getGstRate() == null ? BigDecimal.ZERO : plan.getGstRate();
        invoice.setGstRate(rate);
        invoice.setHsn(plan.getHsn() == null || plan.getHsn().isBlank() ? "9992" : plan.getHsn());
        if (invoice.getSacCode() == null || invoice.getSacCode().isBlank()) {
            invoice.setSacCode(plan.getSacCode() == null || plan.getSacCode().isBlank() ? "999293" : plan.getSacCode());
        }
        BigDecimal tax = invoice.getAmount().multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        invoice.setTaxAmount(tax);
        String instituteState = OrgSecrets.live(org, "gstState");
        String pos = invoice.getPlaceOfSupply() == null ? "" : invoice.getPlaceOfSupply();
        boolean interstate = !instituteState.isBlank() && !pos.isBlank() && !instituteState.equalsIgnoreCase(pos);
        if (interstate) {
            invoice.setIgst(tax);
            invoice.setCgst(BigDecimal.ZERO);
            invoice.setSgst(BigDecimal.ZERO);
        } else {
            invoice.setCgst(tax.divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP));
            invoice.setSgst(invoice.getCgst());
            invoice.setIgst(BigDecimal.ZERO);
        }
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static boolean isOffline(String method) {
        if (method == null) {
            return false;
        }
        String m = method.trim().toUpperCase();
        return "CASH".equals(m) || "CHEQUE".equals(m) || "BANK".equals(m) || "NEFT".equals(m)
                || "UPI_OFFLINE".equals(m) || "OFFLINE".equals(m) || "SCHOLARSHIP".equals(m);
    }

    private static String normalizeMethod(String method) {
        if (method == null || method.isBlank()) {
            return "CASH";
        }
        return method.trim().toUpperCase();
    }

    private static String paymentMethodKind(Payment payment) {
        if ("CREDIT_NOTE".equalsIgnoreCase(payment.getMethod()) || "REFUNDED".equalsIgnoreCase(payment.getStatus())) {
            return "CREDIT_NOTE";
        }
        if ("PENDING".equalsIgnoreCase(payment.getStatus())) {
            return "PENDING";
        }
        return isOffline(payment.getMethod()) ? "OFFLINE" : "PAYMENT";
    }

    private static Map<String, Object> ledgerRow(Instant at, String type, String ref, BigDecimal amount, String status,
                                                 String student, UUID invoiceId, UUID paymentId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("at", at);
        row.put("type", type);
        row.put("ref", ref);
        row.put("amount", amount);
        row.put("status", status);
        row.put("student", student);
        row.put("invoiceId", invoiceId);
        row.put("paymentId", paymentId);
        return row;
    }

    private static boolean isOverdue(Invoice invoice) {
        if (invoice == null || "PAID".equalsIgnoreCase(invoice.getStatus()) || "CANCELLED".equalsIgnoreCase(invoice.getStatus())) {
            return false;
        }
        if (invoice.getDueDate() == null) {
            return false;
        }
        return invoice.getDueDate().isBefore(LocalDate.now());
    }

    private Map<String, Object> remindOne(Organization org, Invoice invoice, boolean requireStaff) {
        if (requireStaff) {
            Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT);
        }
        if ("PAID".equalsIgnoreCase(invoice.getStatus()) || "CANCELLED".equalsIgnoreCase(invoice.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "This invoice is not due");
        }
        Student student = store.getOwned(Student.class, invoice.getStudentId(), org.getId());
        BigDecimal due = invoice.getAmount().subtract(nvl(invoice.getPaidAmount()));
        String title = "Fee due " + invoice.getInvoiceNo();
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("name", student.getFullName());
        vars.put("amount", "₹" + due);
        vars.put("invoice", invoice.getInvoiceNo());
        vars.put("dueDate", invoice.getDueDate() == null ? "" : invoice.getDueDate().toString());
        vars.put("institute", org.getName() == null ? "" : org.getName());
        String body = renderTemplate(findTemplate(org.getId(), "FEE_REMINDER", "WHATSAPP"),
                "₹" + due + " is due for invoice " + invoice.getInvoiceNo()
                        + (invoice.getDueDate() == null ? "." : " (due " + invoice.getDueDate() + ")."),
                vars);
        String emailBody = renderTemplate(findTemplate(org.getId(), "FEE_REMINDER", "EMAIL"), body, vars);
        Notification n = new Notification();
        n.setOrganizationId(org.getId());
        n.setStudentId(student.getId());
        n.setChannel("IN_APP");
        n.setAudience("STUDENT");
        n.setTitle(title);
        n.setBody(body);
        n.setStatus("SENT");
        store.save(n);
        String phone = student.getPhone();
        var wa = messaging.send(org.getId(), "WHATSAPP", phone, title, body);
        String email = student.getEmail();
        var mail = (email == null || email.isBlank() || email.endsWith("@student.local"))
                ? null
                : messaging.send(org.getId(), "EMAIL", email, title, emailBody);
        invoice.setLastRemindedAt(Instant.now());
        store.save(invoice);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("invoiceId", invoice.getId());
        out.put("inApp", "SENT");
        out.put("whatsapp", wa.status());
        out.put("email", mail == null ? "SKIPPED" : mail.status());
        return out;
    }

    public Map<String, Object> receipt(UUID receiptId) {
        PropelUser user = Auth.current();
        Receipt rec = store.getOwned(Receipt.class, receiptId, user.organizationId());
        Invoice invoice = store.getOwned(Invoice.class, rec.getInvoiceId(), user.organizationId());
        if (Roles.STUDENT.equals(user.role())) {
            List<Student> mine = store.listBy(Student.class, user.organizationId(), "userId", user.userId());
            UUID studentId = mine.isEmpty() ? null : mine.getFirst().getId();
            if (studentId == null || !studentId.equals(invoice.getStudentId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Not your receipt");
            }
        }
        Organization org = store.get(Organization.class, user.organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", rec.getId());
        out.put("receiptNo", rec.getReceiptNo());
        out.put("amount", rec.getAmount());
        out.put("gstin", rec.getGstin());
        out.put("issuedAt", rec.getIssuedAt());
        out.put("invoiceNo", invoice.getInvoiceNo());
        out.put("invoiceStatus", invoice.getStatus());
        out.put("instituteName", org.getName());
        out.put("instituteGstin", org.getGstin());
        out.put("buyerName", invoice.getBuyerName());
        out.put("buyerGstin", invoice.getBuyerGstin());
        out.put("placeOfSupply", invoice.getPlaceOfSupply());
        out.put("sacCode", invoice.getSacCode());
        out.put("hsn", invoice.getHsn());
        out.put("cgst", invoice.getCgst());
        out.put("sgst", invoice.getSgst());
        out.put("igst", invoice.getIgst());
        out.put("taxAmount", invoice.getTaxAmount());
        return out;
    }

    @Transactional
    public Invoice finalizeInvoice(Invoice invoice) {
        Organization org = store.get(Organization.class, invoice.getOrganizationId());
        Gstins.requireValid(invoice.getBuyerGstin());
        invoice.setBuyerGstin(Gstins.normalize(invoice.getBuyerGstin()));
        if (invoice.getBuyerGstin().isBlank()) {
            invoice.setBuyerGstin(null);
        }
        if (invoice.getSacCode() == null || invoice.getSacCode().isBlank()) {
            invoice.setSacCode("999293");
        }
        if (invoice.getSeriesPrefix() == null || invoice.getSeriesPrefix().isBlank()) {
            String series = OrgSecrets.live(org, "invoiceSeries");
            invoice.setSeriesPrefix(series.isBlank() ? "INV" : series);
        }
        if (invoice.getPlaceOfSupply() == null || invoice.getPlaceOfSupply().isBlank()) {
            invoice.setPlaceOfSupply(OrgSecrets.live(org, "gstState"));
        }
        if (invoice.getInvoiceNo() == null || invoice.getInvoiceNo().isBlank()) {
            invoice.setInvoiceNo(nextInvoiceNo(org));
        }
        if (invoice.getFeePlanId() != null) {
            FeePlan plan = store.getOwned(FeePlan.class, invoice.getFeePlanId(), invoice.getOrganizationId());
            if (invoice.getCourseId() == null) {
                invoice.setCourseId(plan.getCourseId());
            }
            applyGst(invoice, plan, org);
        } else {
            FeePlan adhoc = new FeePlan();
            adhoc.setGstRate(invoice.getGstRate() == null ? BigDecimal.ZERO : invoice.getGstRate());
            adhoc.setHsn(invoice.getHsn());
            adhoc.setSacCode(invoice.getSacCode());
            applyGst(invoice, adhoc, org);
        }
        return store.save(invoice);
    }

    public Map<String, Object> taxInvoice(UUID invoiceId) {
        PropelUser user = Auth.current();
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, user.organizationId());
        Organization org = store.get(Organization.class, user.organizationId());
        Student student = store.getOwned(Student.class, invoice.getStudentId(), user.organizationId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("invoiceNo", invoice.getInvoiceNo());
        out.put("status", invoice.getStatus());
        out.put("dueDate", invoice.getDueDate());
        out.put("amount", invoice.getAmount());
        out.put("taxAmount", invoice.getTaxAmount());
        out.put("cgst", invoice.getCgst());
        out.put("sgst", invoice.getSgst());
        out.put("igst", invoice.getIgst());
        out.put("gstRate", invoice.getGstRate());
        out.put("hsn", invoice.getHsn());
        out.put("sacCode", invoice.getSacCode());
        out.put("placeOfSupply", invoice.getPlaceOfSupply());
        out.put("buyerName", invoice.getBuyerName() == null || invoice.getBuyerName().isBlank() ? student.getFullName() : invoice.getBuyerName());
        out.put("buyerGstin", invoice.getBuyerGstin());
        out.put("instituteName", org.getName());
        out.put("instituteGstin", org.getGstin());
        out.put("instituteAddress", org.getWebsite() == null ? "" : org.getWebsite());
        return out;
    }

    public Map<String, Object> gatewayNote() {
        UUID org = Auth.current().organizationId();
        return Map.of("provider", payments.provider(org), "live", payments.live(org));
    }

    public Map<String, Object> accountingExport(String format, LocalDate from, LocalDate to) {
        Access.requireAny(Auth.current(), Roles.OWNER, Roles.ACCOUNTANT);
        String kind = format == null || format.isBlank() ? "csv" : format.trim().toLowerCase();
        List<Map<String, Object>> rows = new ArrayList<>();
        UUID orgId = Auth.current().organizationId();
        for (Invoice invoice : store.list(Invoice.class, orgId)) {
            if ("CANCELLED".equalsIgnoreCase(invoice.getStatus()) || invoice.getCreatedAt() == null) {
                continue;
            }
            LocalDate day = invoice.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate();
            if (from != null && day.isBefore(from)) {
                continue;
            }
            if (to != null && day.isAfter(to)) {
                continue;
            }
            rows.add(voucher("Sales", invoice.getInvoiceNo(), day, invoice.getBuyerName(), invoice.getBuyerGstin(),
                    invoice.getAmount(), nvl(invoice.getCgst()), nvl(invoice.getSgst()), nvl(invoice.getIgst()),
                    "Fee invoice " + invoice.getInvoiceNo()));
        }
        for (Payment payment : store.list(Payment.class, orgId)) {
            if (!"CAPTURED".equalsIgnoreCase(payment.getStatus()) && !"REFUNDED".equalsIgnoreCase(payment.getStatus())) {
                continue;
            }
            Instant at = payment.getReceivedAt();
            if (at == null) {
                continue;
            }
            LocalDate day = at.atZone(ZoneId.systemDefault()).toLocalDate();
            if (from != null && day.isBefore(from)) {
                continue;
            }
            if (to != null && day.isAfter(to)) {
                continue;
            }
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            String voucherType = "CREDIT_NOTE".equalsIgnoreCase(payment.getMethod()) ? "Credit Note" : "Receipt";
            String no = payment.getReceiptNo() != null ? payment.getReceiptNo() : payment.getGatewayRef();
            rows.add(voucher(voucherType, no, day, invoice.getBuyerName(), invoice.getBuyerGstin(),
                    payment.getAmount(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    voucherType + " against " + invoice.getInvoiceNo()));
        }
        List<String> columns = switch (kind) {
            case "tally" -> List.of("Date", "VoucherType", "VoucherNo", "Ledger", "GSTIN", "Amount", "CGST", "SGST", "IGST", "Narration");
            case "zoho" -> List.of("Invoice Date", "Invoice Number", "Customer Name", "GSTIN", "Item Name", "Quantity", "Rate", "CGST", "SGST", "IGST", "Total");
            default -> List.of("date", "voucherType", "voucherNo", "party", "gstin", "taxable", "cgst", "sgst", "igst", "total", "narration");
        };
        List<Map<String, Object>> shaped = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            shaped.add(shapeExport(kind, row));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("format", kind);
        out.put("columns", columns);
        out.put("rows", shaped);
        return out;
    }

    public Map<String, Object> financeDashboard(int days) {
        Access.requireTenant(Auth.current());
        UUID orgId = Auth.current().organizationId();
        Instant from = days > 0 ? Instant.now().minusSeconds(days * 86400L) : Instant.EPOCH;
        Map<UUID, Student> students = new HashMap<>();
        for (Student s : store.list(Student.class, orgId)) {
            students.put(s.getId(), s);
        }
        Map<UUID, String> courseNames = new HashMap<>();
        for (Course c : store.list(Course.class, orgId)) {
            courseNames.put(c.getId(), c.getName());
        }
        Map<UUID, UUID> counselorByStudent = new HashMap<>();
        for (Inquiry inq : store.list(Inquiry.class, orgId)) {
            if (inq.getStudentId() != null && inq.getCounselorUserId() != null) {
                counselorByStudent.put(inq.getStudentId(), inq.getCounselorUserId());
            }
        }
        Map<UUID, String> userNames = new HashMap<>();
        Map<String, BigDecimal[]> byCourse = new LinkedHashMap<>();
        Map<String, BigDecimal[]> byCounselor = new LinkedHashMap<>();
        BigDecimal outstanding = BigDecimal.ZERO;
        BigDecimal billed = BigDecimal.ZERO;
        for (Invoice invoice : store.list(Invoice.class, orgId)) {
            if ("CANCELLED".equalsIgnoreCase(invoice.getStatus())) {
                continue;
            }
            BigDecimal remaining = nvl(invoice.getAmount()).subtract(nvl(invoice.getPaidAmount()));
            if (remaining.signum() < 0) {
                remaining = BigDecimal.ZERO;
            }
            if (!"PAID".equalsIgnoreCase(invoice.getStatus())) {
                outstanding = outstanding.add(remaining);
            }
            if (invoice.getCreatedAt() != null && !invoice.getCreatedAt().isBefore(from)) {
                billed = billed.add(nvl(invoice.getAmount()));
            }
            String course = courseName(invoice, students.get(invoice.getStudentId()), courseNames);
            String counselor = counselorName(invoice.getStudentId(), counselorByStudent, userNames);
            bump(byCourse, course, BigDecimal.ZERO, remaining);
            bump(byCounselor, counselor, BigDecimal.ZERO, remaining);
        }
        BigDecimal collected = BigDecimal.ZERO;
        int captured = 0;
        for (Payment payment : store.list(Payment.class, orgId)) {
            if (payment.getReceivedAt() != null && payment.getReceivedAt().isBefore(from)) {
                continue;
            }
            if ("PENDING".equalsIgnoreCase(payment.getStatus())) {
                continue;
            }
            if (!"CAPTURED".equalsIgnoreCase(payment.getStatus()) && !"REFUNDED".equalsIgnoreCase(payment.getStatus())) {
                continue;
            }
            collected = collected.add(nvl(payment.getAmount()));
            if ("CAPTURED".equalsIgnoreCase(payment.getStatus())) {
                captured++;
            }
            Invoice invoice = store.getOwned(Invoice.class, payment.getInvoiceId(), orgId);
            String course = courseName(invoice, students.get(invoice.getStudentId()), courseNames);
            String counselor = counselorName(invoice.getStudentId(), counselorByStudent, userNames);
            bump(byCourse, course, nvl(payment.getAmount()), BigDecimal.ZERO);
            bump(byCounselor, counselor, nvl(payment.getAmount()), BigDecimal.ZERO);
        }
        BigDecimal base = collected.add(outstanding);
        int pct = base.signum() == 0 ? 0 : collected.multiply(BigDecimal.valueOf(100)).divide(base, 0, RoundingMode.HALF_UP).intValue();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("outstanding", outstanding);
        out.put("collected", collected);
        out.put("due", outstanding);
        out.put("billed", billed);
        out.put("collectionPct", pct);
        out.put("transactions", captured);
        out.put("revenue", collected);
        out.put("byCourse", buckets(byCourse));
        out.put("byCounselor", buckets(byCounselor));
        return out;
    }

    private String nextInvoiceNo(Organization org) {
        String prefix = OrgSecrets.live(org, "invoiceSeries");
        if (prefix.isBlank()) {
            prefix = "INV";
        }
        int seq = OrgSecrets.liveInt(org, "invoiceNextSeq", 0) + 1;
        OrgSecrets.putLive(org, "invoiceNextSeq", Integer.toString(seq));
        store.save(org);
        return prefix + "/" + fiscalYearLabel(LocalDate.now()) + "/" + String.format("%04d", seq);
    }

    private String nextCreditNoteNo(Organization org) {
        int seq = OrgSecrets.liveInt(org, "creditNoteNextSeq", 0) + 1;
        OrgSecrets.putLive(org, "creditNoteNextSeq", Integer.toString(seq));
        store.save(org);
        return "CN/" + fiscalYearLabel(LocalDate.now()) + "/" + String.format("%04d", seq);
    }

    private static String fiscalYearLabel(LocalDate day) {
        int start = day.getYear();
        if (day.getMonthValue() < 4) {
            start--;
        }
        return start + "-" + String.valueOf(start + 1).substring(2);
    }

    private static BigDecimal[] prorateTax(Invoice invoice, BigDecimal part) {
        BigDecimal total = nvl(invoice.getAmount());
        BigDecimal share = nvl(part);
        if (total.signum() <= 0 || share.signum() <= 0) {
            return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO};
        }
        BigDecimal ratio = share.divide(total, 8, RoundingMode.HALF_UP);
        return new BigDecimal[]{
                nvl(invoice.getCgst()).multiply(ratio).setScale(2, RoundingMode.HALF_UP),
                nvl(invoice.getSgst()).multiply(ratio).setScale(2, RoundingMode.HALF_UP),
                nvl(invoice.getIgst()).multiply(ratio).setScale(2, RoundingMode.HALF_UP)
        };
    }

    private static Map<String, Object> voucher(String type, String no, LocalDate day, String party, String gstin,
                                               BigDecimal taxable, BigDecimal cgst, BigDecimal sgst, BigDecimal igst,
                                               String narration) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("date", day.toString());
        row.put("voucherType", type);
        row.put("voucherNo", no == null ? "" : no);
        row.put("party", party == null ? "" : party);
        row.put("gstin", gstin == null ? "" : gstin);
        row.put("taxable", taxable);
        row.put("cgst", cgst);
        row.put("sgst", sgst);
        row.put("igst", igst);
        row.put("total", taxable);
        row.put("narration", narration);
        return row;
    }

    private static Map<String, Object> shapeExport(String kind, Map<String, Object> row) {
        if ("tally".equals(kind)) {
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("Date", row.get("date"));
            t.put("VoucherType", row.get("voucherType"));
            t.put("VoucherNo", row.get("voucherNo"));
            t.put("Ledger", row.get("party"));
            t.put("GSTIN", row.get("gstin"));
            t.put("Amount", row.get("taxable"));
            t.put("CGST", row.get("cgst"));
            t.put("SGST", row.get("sgst"));
            t.put("IGST", row.get("igst"));
            t.put("Narration", row.get("narration"));
            return t;
        }
        if ("zoho".equals(kind)) {
            Map<String, Object> z = new LinkedHashMap<>();
            z.put("Invoice Date", row.get("date"));
            z.put("Invoice Number", row.get("voucherNo"));
            z.put("Customer Name", row.get("party"));
            z.put("GSTIN", row.get("gstin"));
            z.put("Item Name", row.get("voucherType"));
            z.put("Quantity", 1);
            z.put("Rate", row.get("taxable"));
            z.put("CGST", row.get("cgst"));
            z.put("SGST", row.get("sgst"));
            z.put("IGST", row.get("igst"));
            z.put("Total", row.get("total"));
            return z;
        }
        return row;
    }

    private String courseName(Invoice invoice, Student student, Map<UUID, String> courseNames) {
        UUID courseId = invoice.getCourseId();
        if (courseId == null && student != null) {
            courseId = student.getCourseId();
        }
        if (courseId == null) {
            return "Unassigned";
        }
        String name = courseNames.get(courseId);
        return name == null || name.isBlank() ? "Unassigned" : name;
    }

    private String counselorName(UUID studentId, Map<UUID, UUID> counselorByStudent, Map<UUID, String> userNames) {
        UUID userId = studentId == null ? null : counselorByStudent.get(studentId);
        if (userId == null) {
            return "Unassigned";
        }
        return userNames.computeIfAbsent(userId, id -> {
            try {
                AppUser u = store.get(AppUser.class, id);
                return u.getFullName() == null || u.getFullName().isBlank() ? "Unassigned" : u.getFullName();
            } catch (Exception e) {
                return "Unassigned";
            }
        });
    }

    private static void bump(Map<String, BigDecimal[]> buckets, String key, BigDecimal collected, BigDecimal outstanding) {
        BigDecimal[] row = buckets.computeIfAbsent(key, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
        row[0] = row[0].add(nvl(collected));
        row[1] = row[1].add(nvl(outstanding));
    }

    private static List<Map<String, Object>> buckets(Map<String, BigDecimal[]> source) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> e : source.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", e.getKey());
            row.put("collected", e.getValue()[0]);
            row.put("outstanding", e.getValue()[1]);
            out.add(row);
        }
        return out;
    }

    private MessageTemplate findTemplate(UUID orgId, String eventType, String channel) {
        return store.list(MessageTemplate.class, orgId).stream()
                .filter(t -> eventType.equalsIgnoreCase(blank(t.getEventType(), ""))
                        && channel.equalsIgnoreCase(blank(t.getChannel(), "")))
                .findFirst()
                .orElse(null);
    }

    private static String renderTemplate(MessageTemplate tpl, String fallback, Map<String, String> vars) {
        String body = tpl == null || tpl.getBody() == null || tpl.getBody().isBlank() ? fallback : tpl.getBody();
        if (vars != null) {
            for (Map.Entry<String, String> e : vars.entrySet()) {
                body = body.replace("{{" + e.getKey() + "}}", e.getValue() == null ? "" : e.getValue());
            }
        }
        return body;
    }

    private static String blank(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
