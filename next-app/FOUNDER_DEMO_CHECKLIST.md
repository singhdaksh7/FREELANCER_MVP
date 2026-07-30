# Founder Demo Checklist

A live, end-to-end walkthrough of the INLAY demo deployment, from
freelancer login through client review, payment, and support. Use the
seeded freelancer account, or create everything fresh — both work.

**Seeded login**: `freelancer@inlay-demo.app` / `InlayDemo@2026`
**Seeded admin login**: `admin@inlay-demo.app` / `InlayDemo@2026`

All payments in this walkthrough are Razorpay **Test Mode** — no real
money moves. All payouts are simulated by the fake payout provider — no
real bank transfer occurs.

1. **Login as freelancer** — go to `https://<your-service>.onrender.com/login`
   and sign in with the freelancer credentials above.
2. **Create a client inline** — from the workspace creation wizard (or the
   Clients page), add a new client without leaving the flow.
3. **Create a workspace** — pick a delivery mode (Payment Required,
   Approval Only, or Preview Only) and fill in the project details.
4. **Upload an image** — add a file to the new workspace and confirm the
   file-processing worker generates a watermarked preview.
5. **Generate the master review link** — copy the client-facing review
   link from the workspace page.
6. **Open the no-login client portal** — open the review link in a
   private/incognito window to confirm no authentication is required.
7. **Add a pin and comment** — click on the preview image to drop a pin
   and leave a comment as the client.
8. **Request changes** — submit a "Request Changes" from the client
   portal.
9. **Upload and submit a revision** — back in the freelancer dashboard,
   upload a new file version and submit it for review.
10. **Approve the version** — as the client, approve the latest submitted
    version.
11. **Complete Razorpay test payment** — for a Payment Required workspace,
    complete checkout using a Razorpay test card (e.g. `4111 1111 1111
    1111`, any future expiry, any CVV).
12. **Download approved originals** — after payment, confirm the client
    can download the unlocked original files (or the delivery ZIP bundle).
13. **Show the 2% platform-fee breakdown** — open the payment's breakdown
    view and confirm the platform fee (200 bps) and freelancer-payable
    amount are shown.
14. **Show simulated freelancer payable** — in the freelancer's
    Settings/Payouts view, confirm the balance reflects the simulated,
    test-mode payout ledger entry.
15. **Raise a support ticket** — from the client portal, submit a support
    ticket referencing the workspace.
16. **Review it from the admin portal** — log in as the admin account and
    confirm the ticket appears under Admin → Support, and reply to it.
