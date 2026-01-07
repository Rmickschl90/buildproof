import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertProof } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useProofs(projectId: number) {
  return useQuery({
    queryKey: [api.proofs.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.proofs.list.path, { projectId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch proofs");
      return api.proofs.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

export function useCreateProof() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertProof) => {
      // Ensure numeric coercion for projectId if coming from form as string
      const payload = { ...data, projectId: Number(data.projectId) };
      
      const res = await fetch(api.proofs.create.path, {
        method: api.proofs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.proofs.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create proof");
      }
      return api.proofs.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.proofs.list.path, data.projectId] });
      toast({
        title: "Proof Uploaded",
        description: "Verification proof has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });
}

export function useToggleVerifyProof() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, verified }: { id: number; verified: boolean }) => {
      const url = buildUrl(api.proofs.update.path, { id });
      const res = await fetch(url, {
        method: api.proofs.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      return api.proofs.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.proofs.list.path, data.projectId] });
      toast({
        title: data.verified ? "Proof Verified" : "Verification Revoked",
        description: `Status has been updated to ${data.verified ? "verified" : "pending"}.`,
      });
    },
  });
}

export function useDeleteProof() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const url = buildUrl(api.proofs.delete.path, { id });
      const res = await fetch(url, { method: api.proofs.delete.method });
      if (!res.ok) throw new Error("Failed to delete proof");
      return projectId; // Pass projectId to onSuccess
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: [api.proofs.list.path, projectId] });
      toast({
        title: "Proof Deleted",
        description: "The proof record has been removed.",
      });
    },
  });
}
