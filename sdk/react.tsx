"use client";

import { useRef, useEffect, memo } from "react";

interface SmartFieldProps {
  type?: string;
  placeholder?: string;
  encryptKey?: string;
  sfSecurity?: "max" | "peek" | "brief";
  sfStealth?: boolean;
  sfType?: string;
  sfDomain?: string;
  style?: Record<string, string>;
  id?: string;
}

// Value store outside React lifecycle — survives re-renders
const _values = new Map<string, string>();

function SmartFieldInner({
  type = "text",
  placeholder = "",
  encryptKey,
  sfSecurity = "brief",
  sfStealth = false,
  sfType,
  sfDomain,
  style = {},
  id,
}: SmartFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sfRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode double-mount
    if (mountedRef.current && sfRef.current) return;
    mountedRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    function createField() {
      // Prevent duplicate creation
      if (sfRef.current && container!.contains(sfRef.current)) return;

      const sf = document.createElement("smart-field") as any;
      sf.setAttribute("type", type);
      sf.setAttribute("placeholder", placeholder);
      sf.setAttribute("sf-security", sfSecurity);
      if (sfStealth) sf.setAttribute("sf-stealth", "");
      if (sfType) sf.setAttribute("sf-type", sfType);
      if (sfDomain) sf.setAttribute("sf-domain", sfDomain);
      if (encryptKey) sf.setAttribute("encrypt-key", encryptKey);
      if (id) sf.id = id;

      const styleStr = Object.entries(style)
        .map(([k, v]) => `${k}:${v}`)
        .join(";");
      if (styleStr) sf.setAttribute("style", styleStr);

      container!.appendChild(sf);
      sfRef.current = sf;

      // Track value changes via sf-input event
      if (id) {
        sf.addEventListener("sf-input", () => {
          try {
            const val = sf.getRealValue?.() ?? sf._s?.("realValue") ?? "";
            _values.set(id, val);
          } catch {
            // Element not ready yet
          }
        });
      }
    }

    // Wait for custom element to be registered before creating
    if (customElements.get("smart-field")) {
      createField();
    } else {
      customElements.whenDefined("smart-field").then(createField);
    }

    return () => {
      if (sfRef.current && container.contains(sfRef.current)) {
        container.removeChild(sfRef.current);
      }
      if (id) _values.delete(id);
      sfRef.current = null;
      mountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} />;
}

/**
 * SmartField React Component
 *
 * Usage:
 * ```tsx
 * <SmartField id="sf-email" type="email" sfSecurity="brief" style={sfStyle} />
 * ```
 *
 * IMPORTANT: Load smartfield.js before this component mounts:
 * ```html
 * <script src="https://cdn.smartfield.dev/v1/smartfield.js" defer></script>
 * ```
 */
export const SmartField = memo(SmartFieldInner);

/**
 * Read the plaintext value from a SmartField by its ID.
 * Uses the public getRealValue() API (v2.6+), falls back to _s(), then event store.
 */
export function getSmartFieldValue(id: string): string {
  const el = document.getElementById(id) as any;
  if (el) {
    try {
      const v = el.getRealValue?.();
      if (v !== undefined) return v;
    } catch {}
    try {
      const v = el._s?.("realValue");
      if (v !== undefined) return v;
    } catch {}
  }
  return _values.get(id) || "";
}

/**
 * Read the encrypted value from a SmartField by its ID.
 * This is what you'd send to your server for decryption.
 */
export function getSmartFieldEncrypted(id: string): string {
  const el = document.getElementById(id) as any;
  return el?.value || "";
}

/**
 * Check if a SmartField has content (without revealing length).
 */
export function smartFieldHasValue(id: string): boolean {
  const el = document.getElementById(id) as any;
  try { return el?.hasValue?.() ?? false; } catch { return false; }
}

/**
 * Clear a SmartField programmatically.
 */
export function clearSmartField(id: string): void {
  const el = document.getElementById(id) as any;
  try { el?.clear?.(); } catch {}
  _values.delete(id);
}
