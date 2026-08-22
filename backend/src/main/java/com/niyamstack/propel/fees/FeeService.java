package com.niyamstack.propel.fees;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.EventHook;
import com.niyamstack.propel.integration.MessagingGateway;
import com.niyamstack.propel.integration.OrgSecrets;
import com.niyamstack.propel.integration.PaymentGateway;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
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

    public FeeService(Store store, PaymentGateway payments, MessagingGateway messaging, AuditService audit, EventHook hooks) {
        this.store = store;
        this.payments = payments;
        this.messaging = messaging;
        this.audit = audit;
        this.hooks = hooks;
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
            invoice.setInvoiceNo(series + "-" + System.currentTimeMillis() % 1_000_000 + "-" + i);
            invoice.setAmount(each);
            invoice.setBuyerName(student.getFullName());
            invoice.setSacCode(plan.getSacCode() == null || plan.getSacCode().isBlank() ? "999293" : plan.getSacCode());
            invoice.setSeriesPrefix(series);
            invoice.setPlaceOfSupply(OrgSecrets.live(store.get(Organization.class, user.organizationId()), "gstState"));
            applyGst(invoice, plan, store.get(Organization.class, user.organizationId()));
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
    public Map<String, Object> collect(UUID invoiceId, BigDecimal amount, String method) {
        PropelUser user = Auth.current();
        Invoice invoice = store.getOwned(Invoice.class, invoiceId, user.organizationId());
        if (Roles.STUDENT.equals(user.role())) {
            Student me = store.listBy(Student.class, user.organizationId(), "userId", user.userId())
                    .stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "No student profile"));
            if (!me.getId().equals(invoice.getStudentId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You can only pay your own fees");
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
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        Access.requirePackage(user, "GROWTH");
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
            refund.setCreditNoteNo("CN-" + Instant.now().toEpochMilli());
        }
        refund = store.save(refund);
        audit.log(approve ? "REFUND_APPROVE" : "REFUND_REJECT", "Refund", refund.getId(), null);
        return refund;
    }

    public List<Invoice> dues() {
        return store.list(Invoice.class, Auth.current().organizationId()).stream()
                .filter(i -> !"PAID".equals(i.getStatus()))
                .toList();
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
            if (invoice.getCreatedAt() == null) {
                continue;
            }
            LocalDate day = invoice.getCreatedAt().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
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
            row.put("buyerGstin", invoice.getBuyerGstin());
            row.put("placeOfSupply", invoice.getPlaceOfSupply());
            row.put("taxable", invoice.getAmount());
            row.put("cgst", invoice.getCgst());
            row.put("sgst", invoice.getSgst());
            row.put("igst", invoice.getIgst());
            row.put("sac", invoice.getSacCode());
            row.put("hsn", invoice.getHsn());
            rows.add(row);
        }
        for (Refund refund : store.list(Refund.class, orgId)) {
            if (!"APPROVED".equals(refund.getStatus()) || refund.getCreditNoteNo() == null) {
                continue;
            }
            LocalDate day = refund.getApprovedAt() == null
                    ? LocalDate.now()
                    : refund.getApprovedAt().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
            if (from != null && day.isBefore(from)) {
                continue;
            }
            if (to != null && day.isAfter(to)) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("docType", "CDNR");
            row.put("invoiceNo", refund.getCreditNoteNo());
            row.put("date", day.toString());
            row.put("taxable", refund.getAmount() == null ? BigDecimal.ZERO : refund.getAmount().negate());
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

    public Invoice finalizeInvoice(Invoice invoice) {
        Organization org = store.get(Organization.class, invoice.getOrganizationId());
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
            invoice.setInvoiceNo(invoice.getSeriesPrefix() + "-" + System.currentTimeMillis() % 1_000_000);
        }
        if (invoice.getFeePlanId() != null) {
            FeePlan plan = store.getOwned(FeePlan.class, invoice.getFeePlanId(), invoice.getOrganizationId());
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
}
