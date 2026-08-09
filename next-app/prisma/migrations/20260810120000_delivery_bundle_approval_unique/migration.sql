-- Automatic delivery (no manual freelancer release step) requires a
-- DB-level idempotency guarantee: at most one DeliveryBundle per approval,
-- so concurrent triggers (webhook + reconciliation for PAYMENT_REQUIRED, or
-- any repeated call for APPROVAL_ONLY) can never create two bundles for the
-- same approved snapshot. See ensureApprovedDeliveryEnqueued in
-- src/data-access/delivery-release.ts.
CREATE UNIQUE INDEX "delivery_bundles_approvalId_key" ON "delivery_bundles"("approvalId");
