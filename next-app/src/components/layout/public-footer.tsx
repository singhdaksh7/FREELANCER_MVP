import { BRAND } from "@/lib/branding";

/** Marketing-site footer. */
export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 px-8 py-8 text-center text-[13px] text-slate-500">
      © 2026 {BRAND.productName} UI V1.0. All Rights Reserved. Clean frontend prototype.
    </footer>
  );
}
