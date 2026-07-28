"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Lock, Menu, X } from "lucide-react";
import type { Creator } from "@/types";
import { CreatorNavigation } from "./creator-navigation";
import { NotificationTrigger } from "./notification-trigger";

export interface CreatorMobileHeaderProps {
  creator: Creator;
  unreadNotificationCount: number;
}

/**
 * Compact mobile header + drawer. The original CreatorLayout had no
 * mobile drawer at all — Settings (and any future secondary nav) was
 * simply unreachable below the 768px breakpoint. This adds a
 * keyboard-operable drawer so secondary navigation has a way in on
 * mobile, per this phase's explicit mobile/accessibility requirements —
 * see MIGRATION_STATUS.md "known differences."
 */
export function CreatorMobileHeader({ creator, unreadNotificationCount }: CreatorMobileHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-vault-navy-light bg-vault-navy px-4 md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls={drawerId}
          aria-label="Open navigation menu"
          className="rounded p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
        >
          <Menu size={22} aria-hidden="true" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-vault-blue">
            <Lock size={15} color="#FFFFFF" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tracking-tight text-white">PROJECT VAULT</span>
        </Link>

        <NotificationTrigger unreadCount={unreadNotificationCount} />
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/50"
          />
          <div
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Creator navigation"
            className="animate-fade-in absolute inset-y-0 left-0 flex w-[280px] max-w-[80vw] flex-col bg-vault-navy shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-vault-navy-light px-4 py-4">
              <span className="text-sm font-bold tracking-tight text-white">PROJECT VAULT</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close navigation menu"
                className="rounded p-1.5 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-blue"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <CreatorNavigation
                unreadNotificationCount={unreadNotificationCount}
                onNavigate={() => setIsOpen(false)}
              />
            </div>

            <div className="border-t border-vault-navy-light px-5 py-3 text-xs text-slate-400">
              Signed in as {creator.name}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
