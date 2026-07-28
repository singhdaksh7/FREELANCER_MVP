"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastMessage, ToastType } from "@/components/ui/toast";

const AUTO_DISMISS_MS = 4000;

/**
 * Local (non-global) toast state, matching the auto-dismiss behavior of
 * the original AppContext.showToast — scoped to a single Client
 * Component instead of a shared app-wide store.
 */
export function useToastMessage() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    timeoutRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [toast]);

  return { toast, showToast };
}
