'use client';
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "./query-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster />
      </ThemeProvider>
    </QueryProvider>
  );
}
