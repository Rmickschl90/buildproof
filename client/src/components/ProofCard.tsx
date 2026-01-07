import { type Proof } from "@shared/schema";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Trash2, CalendarDays } from "lucide-react";
import { useToggleVerifyProof, useDeleteProof } from "@/hooks/use-proofs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProofCardProps {
  proof: Proof;
}

export function ProofCard({ proof }: ProofCardProps) {
  const { mutate: toggleVerify, isPending: isToggling } = useToggleVerifyProof();
  const { mutate: deleteProof, isPending: isDeleting } = useDeleteProof();

  return (
    <div className="group bg-card rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img 
          src={proof.imageUrl} 
          alt={proof.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-4">
          <Badge className={proof.verified ? "bg-emerald-500" : "bg-amber-500"}>
            {proof.verified ? "Verified" : "Pending Review"}
          </Badge>
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-bold text-lg text-primary line-clamp-1">{proof.title}</h4>
          {proof.verified ? (
            <ShieldCheck className="text-emerald-500 w-5 h-5 shrink-0" />
          ) : (
            <ShieldAlert className="text-amber-500 w-5 h-5 shrink-0" />
          )}
        </div>
        
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
          {proof.description}
        </p>
        
        <div className="flex items-center text-xs text-muted-foreground mb-4 font-mono">
          <CalendarDays className="w-3 h-3 mr-2" />
          {proof.createdAt ? format(new Date(proof.createdAt), 'MMM d, yyyy HH:mm') : 'Unknown'}
        </div>

        <div className="flex gap-2 border-t border-border pt-4">
          <Button 
            variant="outline" 
            size="sm" 
            className={`flex-1 ${proof.verified ? 'hover:bg-amber-50 hover:text-amber-600' : 'hover:bg-emerald-50 hover:text-emerald-600'}`}
            disabled={isToggling}
            onClick={() => toggleVerify({ id: proof.id, verified: !proof.verified })}
          >
            {proof.verified ? "Revoke" : "Verify"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Proof?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this verification record. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteProof({ id: proof.id, projectId: proof.projectId })}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
