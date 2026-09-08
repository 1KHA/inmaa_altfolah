"use client"

/**
 * Application toaster (sonner).
 *
 * Mounted once in the root layout — every dashboard (admin, participant,
 * mentor) and public page shares it. Call it through `useToast()` /
 * `toast()` in `components/ui/use-toast.ts`, which maps the app's
 * {title, description, variant} shape onto sonner.
 *
 * Why sonner: the previous hand-rolled toaster rendered each toast at
 * `w-full` inside a `w-full` viewport, so a toast spanned the entire browser
 * width, and it had no success/error styling, no animation and no stacking
 * limit. See mdfiles/toast-system.md.
 */

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/** Fixed toast width — the bug being fixed was an unconstrained full-width toast. */
const TOAST_WIDTH = "380px"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // The app has no next-themes ThemeProvider mounted and `dark` is never
      // set on <html>, so it is always light. Asking sonner for "system" would
      // render dark toasts on a light page for anyone whose OS is dark.
      theme="light"
      dir="rtl"
      // RTL mirror of the conventional bottom-right corner.
      position="bottom-left"
      // Semantic colours: green success / red error / amber warning.
      richColors
      closeButton
      duration={5000}
      // The old toaster stacked without limit; sonner collapses the rest.
      visibleToasts={3}
      style={{ "--width": TOAST_WIDTH } as React.CSSProperties}
      toastOptions={{
        // Inherit the app's Arabic font stack (PingAR) instead of sonner's default.
        className: "font-[inherit]",
        // NOTE: do not force `bg-background` here — that is what the stock
        // shadcn wrapper does, and it overrides richColors' semantic tints.
        classNames: {
          title: "text-sm font-semibold",
          description: "text-sm opacity-90",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
