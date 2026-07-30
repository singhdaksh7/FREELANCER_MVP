"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toast } from "./toast";
import { useToastMessage } from "@/hooks/use-toast-message";

/**
 * Shows a one-time success toast carried across a Server Action's redirect
 * via a `?flash=` query param, then strips that param from the URL so a
 * page refresh never re-shows it. Used after create/update/delete
 * redirects (see src/actions/*.ts).
 */
export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast, showToast } = useToastMessage();

  useEffect(() => {
    const flash = searchParams.get("flash");
    if (!flash) return;

    showToast(flash, "success");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the URL's search params change
  }, [searchParams]);

  return <Toast toast={toast} />;
}
