import { useProjects } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/ProjectCard";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { Sidebar } from "@/components/Sidebar";
import { Activity, CheckCircle2, AlertCircle, BarChart3, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: projects, isLoading, error } = useProjects();
  const [search, setSearch] = useState("");

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.location.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = projects?.filter(p => p.status === 'active').length || 0;
  const completedCount = projects?.filter(p => p.status === 'completed').length || 0;

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        Error loading dashboard: {error.message}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display text-primary">Overview</h1>
            <p className="text-muted-foreground mt-1">Welcome back, Site Manager.</p>
          </div>
          <CreateProjectDialog />
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatCard 
            title="Active Sites" 
            value={isLoading ? "..." : activeCount} 
            icon={Activity} 
            color="text-accent" 
            bg="bg-accent/10"
          />
          <StatCard 
            title="Completed Projects" 
            value={isLoading ? "..." : completedCount} 
            icon={CheckCircle2} 
            color="text-emerald-600" 
            bg="bg-emerald-500/10"
          />
          <StatCard 
            title="Pending Inspections" 
            value={isLoading ? "..." : "3"} // Hardcoded for mockup visual
            icon={AlertCircle} 
            color="text-amber-500" 
            bg="bg-amber-500/10"
          />
        </div>

        {/* Projects Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-display text-primary">Recent Projects</h2>
            </div>
            
            <div className="relative w-72">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search projects..." 
                className="pl-9 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-xl border border-border p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProjects?.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-xl bg-muted/30">
              <p className="text-muted-foreground text-lg">No projects found.</p>
              <p className="text-sm text-muted-foreground mt-2">Try adjusting your search or create a new project.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects?.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: { title: string, value: string | number, icon: any, color: string, bg: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`p-4 rounded-full ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold font-display text-primary">{value}</h3>
      </div>
    </div>
  );
}
