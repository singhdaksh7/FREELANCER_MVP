import { Lock } from "lucide-react";
import type { ReactNode } from "react";

export interface AuthCardProps {
  heading: string;
  subheading: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared chrome (logo, heading, card) for the three auth screens. */
export function AuthCard({ heading, subheading, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vault-navy p-6">
      <div className="w-full max-w-[440px] rounded-lg bg-white p-10 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-vault-blue">
            <Lock size={24} color="#FFFFFF" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink">{heading}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subheading}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </div>
  );
}
