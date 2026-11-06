-- Paid website checkout defers student/login creation until Razorpay capture.
-- Pending invoices therefore have no student_id until fulfillPaidCheckout runs.
ALTER TABLE invoices ALTER COLUMN student_id DROP NOT NULL;
