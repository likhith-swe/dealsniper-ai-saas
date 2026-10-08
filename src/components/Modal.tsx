"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}

/**
 * Shared modal shell: animated entry, Escape to dismiss, backdrop click to dismiss, body
 * scroll lock and dialog semantics. Focus moves to the panel on open so keyboard users are
 * not left behind the overlay.
 */
export default function Modal({ open, onClose, title, eyebrow, subtitle, children, maxWidth = "max-w-2xl" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 40);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[rgba(4,5,8,0.78)] p-4 pt-[8vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`panel w-full ${maxWidth} outline-none`}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
              <div>
                {eyebrow ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-deal">{eyebrow}</p>
                ) : null}
                <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight text-ink">
                  {title}
                </h2>
                {subtitle ? <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
              </div>
              <button type="button" onClick={onClose} className="btn btn-ghost h-9 w-9 shrink-0 p-0" aria-label="Close dialog">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="terminal-scroll max-h-[72vh] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
