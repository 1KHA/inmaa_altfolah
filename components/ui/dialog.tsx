"use client"

import * as React from "react"
import { X } from "lucide-react"

// Simple utility function for class name merging
function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Dialog: React.FC<DialogProps> = ({ 
  open, 
  onOpenChange, 
  children 
}) => {
  const [isOpen, setIsOpen] = React.useState(open || false)
  
  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])
  
  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen)
    onOpenChange?.(newOpen)
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/80" 
        onClick={() => handleOpenChange(false)}
      />
      <div className="relative z-50">
        {children}
      </div>
    </div>
  )
}

const DialogTrigger: React.FC<{
  asChild?: boolean
  children: React.ReactNode
  onClick?: () => void
}> = ({ 
  children, 
  onClick 
}) => {
  return (
    <div onClick={onClick}>
      {children}
    </div>
  )
}

const DialogContent: React.FC<{
  children: React.ReactNode
  className?: string
  dir?: string
}> = ({ 
  children, 
  className,
  dir
}) => {
  return (
    <div 
      className={cn(
        // Same responsive rules as src/components/ui/dialog.tsx — see the comment
        // there. Without max-h + overflow a tall dialog is clipped off-screen.
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-lg border bg-background p-4 shadow-lg sm:p-6",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      dir={dir}
    >
      {children}
    </div>
  )
}

const DialogHeader: React.FC<{
  className?: string
  children: React.ReactNode
}> = ({ 
  className, 
  children 
}) => {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-right",
        className
      )}
    >
      {children}
    </div>
  )
}

const DialogFooter: React.FC<{
  className?: string
  children: React.ReactNode
}> = ({ 
  className, 
  children 
}) => {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className
      )}
    >
      {children}
    </div>
  )
}

const DialogTitle: React.FC<{
  className?: string
  children: React.ReactNode
}> = ({ 
  className, 
  children 
}) => {
  return (
    <h2
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
    >
      {children}
    </h2>
  )
}

const DialogDescription: React.FC<{
  className?: string
  children: React.ReactNode
}> = ({ 
  className, 
  children 
}) => {
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  )
}

const DialogClose: React.FC<{
  className?: string
  onClick?: () => void
  children?: React.ReactNode
}> = ({ 
  className, 
  onClick,
  children
}) => {
  return (
    <button
      className={cn(
        "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
        className
      )}
      onClick={onClick}
    >
      {children || <X className="h-4 w-4" />}
      <span className="sr-only">Close</span>
    </button>
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
}
