import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderKanban, Settings, HardHat } from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "All Projects", icon: FolderKanban },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-card border-r border-border fixed left-0 top-0 flex flex-col z-50">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="bg-accent p-2 rounded-lg">
          <HardHat className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight text-primary">Buildproof</h1>
          <p className="text-xs text-muted-foreground font-medium">Construction Mgr</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div 
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                  ${isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }
                `}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="bg-secondary/50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            JS
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate">John Smith</p>
            <p className="text-xs text-muted-foreground truncate">Site Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
}
