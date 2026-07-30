export type ToastType = "success" | "warning" | "info";

export interface ToastMessage {
  message: string;
  type: ToastType;
}

export interface ToastProps {
  toast: ToastMessage | null;
}

const TOAST_BACKGROUND: Record<ToastType, string> = {
  success: "#065F46",
  warning: "#92400E",
  info: "var(--color-vault-navy)",
};

const TOAST_ICON: Record<ToastType, string> = {
  success: "✓",
  warning: "⚠️",
  info: "ℹ️",
};

/**
 * Fixed bottom-right notification. Rendering is driven entirely by the
 * `toast` prop — callers own the local state (see useToastMessage) and
 * decide when to show/clear it, matching the original Vite component.
 */
export function Toast({ toast }: ToastProps) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed bottom-6 right-6 z-50 flex max-w-[380px] items-center gap-3 rounded-md px-5 py-3.5 text-sm font-medium text-white shadow-lg"
      style={{ backgroundColor: TOAST_BACKGROUND[toast.type] }}
    >
      <span aria-hidden="true">{TOAST_ICON[toast.type]}</span>
      <div>{toast.message}</div>
    </div>
  );
}
