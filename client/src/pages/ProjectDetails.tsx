import { useRoute } from "wouter";
import { useProject } from "@/hooks/use-projects";
import { useProofs } from "@/hooks/use-proofs";
import { Sidebar } from "@/components/Sidebar";
import { ProofCard } from "@/components/ProofCard";
import { CreateProofDialog } from "@/components/CreateProofDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, MapPin, Calendar, HardHat } from "lucide-react";
import { Link } from "wouter";
import NotFound from "./not-found";

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params ? parseInt(params.id) : 0;
  
  const { data: project, isLoading: loadingProject, error: projectError } = useProject(projectId);
  const { data: proofs, isLoading: loadingProofs } = useProofs(projectId);

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-background flex">
        <Sidebar />
        <main className="flex-1 ml-64 p-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full rounded-xl mb-8" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (projectError || !project) return <NotFound />;

  const verifiedCount = proofs?.filter(p => p.verified).length || 0;
  const totalProofs = proofs?.length || 0;
  const progress = totalProofs > 0 ? Math.round((verifiedCount / totalProofs) * 100) : 0;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6 pl-0 hover:bg-transparent hover:text-accent">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </Link>

        {/* Hero Section */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-8 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />
          
          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className="bg-background">{project.status}</Badge>
                <span className="text-sm text-muted-foreground font-mono">ID: #{project.id}</span>
              </div>
              <h1 className="text-4xl font-bold font-display text-primary mb-4">{project.name}</h1>
              <div className="flex items-center gap-6 text-muted-foreground">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" /> {project.location}
                </div>
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2" /> 
                  Started {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>

            <div className="text-right bg-secondary/50 p-4 rounded-xl border border-secondary">
              <p className="text-sm font-medium text-muted-foreground mb-1">Verification Progress</p>
              <div className="flex items-end justify-end gap-2">
                <span className="text-3xl font-bold font-display text-accent">{progress}%</span>
                <span className="text-sm text-muted-foreground mb-1">complete</span>
              </div>
              <div className="w-32 h-2 bg-muted rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <Separator className="my-6" />
          
          <div>
            <h3 className="font-semibold text-foreground mb-2">Project Scope</h3>
            <p className="text-muted-foreground max-w-3xl leading-relaxed">
              {project.description}
            </p>
          </div>
        </div>

        {/* Proofs Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardHat className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold font-display text-primary">Site Proofs</h2>
              <Badge variant="secondary" className="ml-2">{totalProofs}</Badge>
            </div>
            <CreateProofDialog projectId={project.id} />
          </div>

          {loadingProofs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
            </div>
          ) : proofs?.length === 0 ? (
            <div className="text-center py-24 border-2 border-dashed border-border rounded-xl bg-muted/20">
              <HardHat className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium text-foreground">No proofs uploaded yet.</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Start documenting the project progress by uploading photos and verification documents.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {proofs?.map((proof) => (
                <ProofCard key={proof.id} proof={proof} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
