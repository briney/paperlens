import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserNav } from "@/components/user-nav";
import { MobileNav } from "@/components/mobile-nav";
import { CommandMenu, CommandMenuTrigger } from "@/components/command-menu";
import { Separator } from "@/components/ui/separator";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:block">
        <div className="flex h-14 items-center px-6">
          <span className="text-lg font-bold tracking-tight">PaperLens</span>
        </div>
        <Separator />
        <SidebarNav />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav />
            <span className="text-lg font-bold">PaperLens</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <CommandMenuTrigger />
            <UserNav user={user} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <CommandMenu />
      </div>
    </div>
  );
}
