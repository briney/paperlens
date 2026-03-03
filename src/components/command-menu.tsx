"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  Library,
  Settings,
  FileText,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface Paper {
  id: string;
  title: string | null;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload Paper", icon: Upload },
  { href: "/papers", label: "Paper Library", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [papers, setPapers] = useState<Paper[]>([]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Fetch papers when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/papers")
      .then((res) => res.json())
      .then((data) => {
        setPapers(
          (data.papers ?? []).map((p: { id: string; title: string | null }) => ({
            id: p.id,
            title: p.title,
          }))
        );
      })
      .catch(() => setPapers([]));
  }, [open]);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search papers or navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                onSelect={() => runCommand(() => router.push(item.href))}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {papers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Papers">
              {papers.map((paper) => (
                <CommandItem
                  key={paper.id}
                  onSelect={() =>
                    runCommand(() => router.push(`/papers/${paper.id}`))
                  }
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {paper.title ?? "Untitled Paper"}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function CommandMenuTrigger() {
  return (
    <kbd className="pointer-events-none hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
      <span className="text-xs">&#8984;</span>K
    </kbd>
  );
}
