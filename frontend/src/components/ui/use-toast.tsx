import * as React from "react"
import { createContext, useContext } from "react"

type ToastProps = {
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}

type ToastContextType = {
  toast: (props: ToastProps) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toastValue = React.useMemo(() => {
    return {
      toast: (props: ToastProps) => {
        // This is a simplified implementation for demonstration purposes
        console.log('Toast:', props)
        
        // In a real app, you would use a proper toast library or state management
        alert(`${props.title}\n${props.description}`)
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={toastValue}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  
  return context
}
