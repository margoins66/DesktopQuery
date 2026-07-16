import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Files, 
  Search, 
  Columns, 
  FileText, 
  Settings,
  Download,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: Files },
  { href: "/search", label: "Search", icon: Search },
  { href: "/comparisons", label: "Comparisons", icon: Columns },
  { href: "/summaries", label: "Summaries", icon: FileText },
  { href: "/download", label: "Download", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <nav className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-serif text-xl font-bold tracking-tight">DocuRAG</span>
        </div>
        
        <div className="flex-1 px-4 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
