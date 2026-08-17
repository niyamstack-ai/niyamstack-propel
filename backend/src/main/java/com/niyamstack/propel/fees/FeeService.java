package com.niyamstack.propel.fees;

import com.niyamstack.propel.audit.AuditService;
import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.*;
import com.niyamstack.propel.integration.MessagingGateway;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class FeeService {
    private final Store store;
    private final PaymentGateway payments;
    private final MessagingGateway messaging;
    private final AuditService audit;

    public FeeService(Store store, PaymentGateway payments, MessagingGateway messaging, AuditService audit) {
        this.store = store;
        this.payments = payments;
        this.messaging = messaging;
        this.audit = audit;
    }

    @Transactional
    public List<FeeInstallment> scheduleInstallments(UUID planId, UUID studentId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.ACCOUNTANT);
        FeePlan plan = store.getOwned(FeePlan.class, planId, user.organizationId());
        Student student = store.getOwned(Student.class, studentId, user.organizationId());
        int count = plan.getInstallmentCount() == null || plan.getInstallmentCount() < 1 ? 2 : plan.getInstallmentCount();
        BigDecimal each = plan.getTotalAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
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
            invoice.setInvoiceNo("INV-" + System.currentTimeMillis() % 1_000_000 + "-" + i);
            invoice.setAmount(each);
            applyGst(invoice, plan);
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
    public Payment collect(UUID invoiceId, BigDecimal amount, String method) {
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
        PaymentGateway.ChargeResult charge = payments.charge(user.organizationId(), payAmt, method, invoice.getInvoiceNo());
        if (!charge.success()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, charge.message());
        }
        Payment payment = new Payment();
        payment.setOrganizationId(user.organizationId());
        payment.setInvoiceId(invoice.getId());
        payment.setAmount(payAmt);
        payment.setMethod(method == null ? "UPI" : method);
        payment.setGatewayRef(charge.gatewayRef());
        payment.setReceivedAt(Instant.now());
        payment.setStatus("CAPTURED");
        String receiptNo = "RCPT-" + Instant.now().toEpochMilli();
        payment.setReceiptNo(receiptNo);
        payment = store.save(payment);

        invoice.setPaidAmount(nvl(invoice.getPaidAmount()).add(payAmt));
        if (invoice.getPaidAmount().compareTo(invoice.getAmount()) >= 0) {
            invoice.setStatus("PAID");
        } else {
            invoice.setStatus("PARTIAL");
        }
        store.save(invoice);

        Organization org = store.get(Organization.class, user.organizationId());
        Receipt receipt = new Receipt();
        receipt.setOrganizationId(user.organizationId());
        receipt.setPaymentId(payment.getId());
        receipt.setInvoiceId(invoice.getId());
        receipt.setReceiptNo(receiptNo);
        receipt.setAmount(payAmt);
        receipt.setGstin(org.getGstin());
        receipt.setIssuedAt(Instant.now());
        store.save(receipt);

        var send = messaging.send("WHATSAPP", "student", "Fee receipt",
                "Receipt " + receiptNo + " for invoice " + invoice.getInvoiceNo() + " (" + payments.provider() + ")");
        Notification n = new Notification();
        n.setOrganizationId(user.organizationId());
        n.setChannel("WHATSAPP");
        n.setAudience("student");
        n.setTitle("Fee receipt");
        n.setBody(send.message() + " — " + receiptNo);
        n.setStatus(send.status());
        store.save(n);

        audit.log("FEE_COLLECT", "Payment", payment.getId(), receiptNo + " live=" + payments.live());
        return payment;
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

    private void applyGst(Invoice invoice, FeePlan plan) {
        BigDecimal rate = plan.getGstRate() == null ? BigDecimal.ZERO : plan.getGstRate();
        invoice.setGstRate(rate);
        invoice.setHsn(plan.getHsn());
        BigDecimal tax = invoice.getAmount().multiply(rate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        invoice.setTaxAmount(tax);
        invoice.setCgst(tax.divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP));
        invoice.setSgst(invoice.getCgst());
        invoice.setIgst(BigDecimal.ZERO);
    }

    private static BigDecimal nvl(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    public Map<String, Object> gatewayNote() {
        return Map.of("provider", payments.provider(), "live", payments.live());
    }
}
