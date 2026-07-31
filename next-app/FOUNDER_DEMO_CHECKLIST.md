# Founder Demo Checklist

A live, end-to-end walkthrough of the INLAY demo deployment, from
freelancer login through client review and payment. Use the seeded
freelancer account, or create everything fresh — both work.

**Seeded login**: `freelancer@inlay-demo.app` / `InlayDemo@2026`
**Seeded admin login**: `admin@inlay-demo.app` / `InlayDemo@2026`

All payments in this walkthrough are Razorpay **Test Mode** — no real
money moves. All payouts are simulated by the fake payout provider — no
real bank transfer occurs. INLAY charges no platform fee — the
freelancer receives the full captured amount.

1. **Login as freelancer** — go to `https://<your-service>.onrender.com/login`
   and sign in with the freelancer credentials above.
2. **Create a workspace** — from the workspace creation wizard, enter a
   client name as plain text, pick a delivery mode (Payment Required or
   Approval Only), and fill in the project details.
3. **Upload an image** — add a file to the new workspace and confirm the
   file-processing worker generates a watermarked preview.
4. **Preview the client view** — from the workspace page, open "Preview
   Client View" to confirm it renders the exact review UI a client sees,
   with every mutating action (approve, comment, pin, annotate, pay,
   download) disabled.
5. **Generate the master review link** — copy the client-facing review
   link from the workspace page.
6. **Open the review link with no login** — open the review link in a
   private/incognito window to confirm no authentication is required.
7. **Add a pin and comment** — click on the preview image to drop a pin
   and leave a comment as the client.
8. **Request changes** — submit a "Request Changes" from the review
   page.
9. **Upload and submit a revision** — back in the freelancer dashboard,
   upload a new file version and submit it for review.
10. **Approve the version** — as the client, approve the latest submitted
    version.
11. **Complete Razorpay test payment** — for a Payment Required workspace,
    complete checkout using a Razorpay test card (e.g. `4111 1111 1111
    1111`, any future expiry, any CVV).
12. **Download approved originals** — after payment, confirm the client
    can download the unlocked original files (or the delivery ZIP bundle).
13. **Show the payment amount** — open the payment's detail view and
    confirm it shows a single Amount, matching exactly what was captured
    (no fee deduction).
14. **Show simulated freelancer payable** — in the freelancer's Payments
    view, confirm the balance reflects the simulated, test-mode payout
    ledger entry, equal to the full captured amount.
15. **Check the Support section** — from Settings, confirm the Support
    section shows a contact email (and WhatsApp link, if configured) —
    there is no ticket system.
