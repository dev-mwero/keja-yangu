"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Something went wrong!</h1>
        <p className="mb-4 text-xl text-muted-foreground">An unexpected error occurred.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
