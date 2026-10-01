"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  timestamp: number;
}

// Global state for toasts
let toasts: Toast[] = [];
let toastId = 0;

// Function to add a toast
export const addToast = (message: string, type: ToastType = "info") => {
  const id = toastId++;
  const newToast: Toast = {
    id,
    message,
    type,
    timestamp: Date.now(),
  };
  
  toasts = [...toasts, newToast];
  
  // Dispatch a custom event to notify the toaster component
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("toast-added"));
  }
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeToast(id);
  }, 5000);
  
  return id;
};

// Function to remove a toast
export const removeToast = (id: number) => {
  toasts = toasts.filter((toast) => toast.id !== id);
  
  // Dispatch a custom event to notify the toaster component
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("toast-removed"));
  }
};

// Helper function to show toast with the same interface as in components/admin/admin-toaster.tsx
export function showAdminToast(toast: { title?: string; description?: string; variant?: "default" | "destructive" }) {
  const type = toast.variant === "destructive" ? "error" : "success";
  const message = toast.title ? (toast.description ? `${toast.title}: ${toast.description}` : toast.title) : toast.description || "";
  addToast(message, type);
}

export function AdminToaster() {
  const [localToasts, setLocalToasts] = useState<Toast[]>([]);
  
  useEffect(() => {
    // Update local state when toasts change
    const updateToasts = () => {
      setLocalToasts([...toasts]);
    };
    
    // Listen for toast events
    window.addEventListener("toast-added", updateToasts);
    window.addEventListener("toast-removed", updateToasts);
    
    // Initial state
    updateToasts();
    
    return () => {
      window.removeEventListener("toast-added", updateToasts);
      window.removeEventListener("toast-removed", updateToasts);
    };
  }, []);
  
  const getToastClasses = (type: ToastType) => {
    const baseClasses = "p-4 rounded-md shadow-md flex justify-between items-center mb-2";
    
    switch (type) {
      case "success":
        return `${baseClasses} bg-green-100 text-green-800 border-l-4 border-green-500`;
      case "error":
        return `${baseClasses} bg-red-100 text-red-800 border-l-4 border-red-500`;
      case "warning":
        return `${baseClasses} bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500`;
      case "info":
      default:
        return `${baseClasses} bg-[#f9d69f]/40 text-[#5e1213] border-l-4 border-[#f9d69f]`;
    }
  };
  
  if (localToasts.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-full">
      {localToasts.map((toast) => (
        <div key={toast.id} className={getToastClasses(toast.type)}>
          <div>{toast.message}</div>
          <button
            onClick={() => removeToast(toast.id)}
            className="ml-2 text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
