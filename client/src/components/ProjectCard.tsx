import { Link } from "wouter";
import { format } from "date-fns";
import { MapPin, Calendar, ArrowRight, Activity, CheckCircle2, Archive } from "lucide-react";
import { type Project } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const statusColors = {
    active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    completed: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    archived: "bg-gray-500/10 text-gray-700 border-gray-500/20",
  };

  const statusIcons = {
    active: <Activity className="w-3 h-3 mr-1" />,
    completed: <CheckCircle2 className="w-3 h-3 mr-1" />,
    archived: <Archive className="w-3 h-3 mr-1" />,
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-xl hover:border-accent/40 transition-all duration-300 cursor-pointer h-full flex flex-col relative overflow-hidden">
        {/* Subtle accent line on hover */}
        <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="flex justify-between items-start mb-4">
          <Badge variant="outline" className={`capitalize pl-2 pr-3 py-1 ${statusColors[project.status as keyof typeof statusColors]}`}>
            {statusIcons[project.status as keyof typeof statusIcons]}
            {project.status}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">ID: #{project.id.toString().padStart(4, '0')}</span>
        </div>

        <h3 className="text-xl font-bold font-display text-primary mb-2 group-hover:text-accent transition-colors">
          {project.name}
        </h3>
        
        <p className="text-muted-foreground text-sm mb-6 line-clamp-2 flex-1">
          {project.description}
        </p>

        <div className="space-y-3 pt-4 border-t border-border/50">
          <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 mr-2 text-primary/60" />
            <span className="truncate">{project.location}</span>
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 mr-2 text-primary/60" />
            <span>Started {project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : 'N/A'}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end text-accent text-sm font-semibold opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300">
          View Details <ArrowRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </Link>
  );
}
