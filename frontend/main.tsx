import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DotPatternDemo } from "@/components/ui/demo";
import "@/styles/globals.css";

function App() {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg font-medium">Component preview</h1>
        <button type="button" aria-pressed={dark} onClick={() => setDark(!dark)}
          className="rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
          Dark mode
        </button>
      </header>
      <DotPatternDemo />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
