/**
 * Toast API — a thin adapter over sonner (src/components/ui/sonner.tsx).
 *
 * Keeps the `useToast()` / `toast({title, description, variant})` shape the
 * ~23 call sites across the app already use, so switching the underlying
 * library needed no changes at those call sites, and routes each call to the
 * right sonner variant so successes and failures finally look different.
 *
 * Variant mapping:
 *   destructive          -> toast.error    (red)
 *   success              -> toast.success  (green)
 *   warning              -> toast.warning  (amber)
 *   info                 -> toast.info     (blue)
 *   default / omitted    -> inferred from the title/description text, see
 *                           inferVariant() — legacy calls pass no variant for
 *                           successes ("نجح", "تم ... بنجاح").
 *
 * New code should pass an explicit variant; inference is only a bridge for the
 * existing call sites. See mdfiles/toast-system.md.
 */

import { toast as sonner } from "sonner"

export type ToastVariant = "default" | "destructive" | "success" | "warning" | "info"

export type ToastProps = {
  id?: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: ToastVariant
  /** Milliseconds; falls back to the Toaster's default (5s). */
  duration?: number
}

export type ToastActionElement = React.ReactElement
export type ToasterToast = ToastProps & { id: string }

/** Errors stay up longer than successes — they usually need reading/acting on. */
const ERROR_DURATION_MS = 7000

const ERROR_HINTS = ["خطأ", "فشل", "لم يتم", "غير مصرح", "تعذر", "error", "failed", "fail"]
const WARNING_HINTS = ["تحذير", "تنبيه", "انتبه", "warning"]
const SUCCESS_HINTS = ["نجح", "نجاح", "بنجاح", "تم ", "تمت", "success"]

function textOf(value: React.ReactNode): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

/**
 * Guess a variant for legacy calls that pass none.
 * Error hints are checked FIRST on purpose: "لم يتم" (was not done) contains
 * "تم" (done), so a success-first check would misclassify failures as wins.
 */
function inferVariant(title?: React.ReactNode, description?: React.ReactNode): ToastVariant {
  const text = `${textOf(title)} ${textOf(description)}`.toLowerCase()
  if (!text.trim()) return "default"
  const has = (hints: string[]) => hints.some((h) => text.includes(h.toLowerCase()))
  if (has(ERROR_HINTS)) return "destructive"
  if (has(WARNING_HINTS)) return "warning"
  if (has(SUCCESS_HINTS)) return "success"
  return "default"
}

function show(props: ToastProps) {
  const { title, description, variant, duration, action } = props

  const resolved = !variant || variant === "default" ? inferVariant(title, description) : variant

  // sonner takes the headline as its first argument and the rest as options.
  // Calls that pass only a description still get a readable toast.
  const headline: React.ReactNode = title || description
  const body = title ? description : undefined
  const options = {
    description: body,
    action: action as never,
    duration: duration ?? (resolved === "destructive" ? ERROR_DURATION_MS : undefined),
  }

  switch (resolved) {
    case "destructive":
      return sonner.error(headline, options)
    case "success":
      return sonner.success(headline, options)
    case "warning":
      return sonner.warning(headline, options)
    case "info":
      return sonner.info(headline, options)
    default:
      return sonner(headline, options)
  }
}

function toast(props: ToastProps) {
  const id = show(props)
  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (next: ToastProps) => {
      sonner.dismiss(id)
      show(next)
    },
  }
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => sonner.dismiss(toastId),
    /** Kept for API compatibility; sonner owns the rendered list. */
    toasts: [] as ToasterToast[],
  }
}

export { useToast, toast }
