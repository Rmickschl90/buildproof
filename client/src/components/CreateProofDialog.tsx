import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProofSchema, type InsertProof } from "@shared/schema";
import { useCreateProof } from "@/hooks/use-proofs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Upload } from "lucide-react";
import { useState } from "react";

interface CreateProofDialogProps {
  projectId: number;
}

export function CreateProofDialog({ projectId }: CreateProofDialogProps) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreateProof();

  const form = useForm<InsertProof>({
    resolver: zodResolver(insertProofSchema),
    defaultValues: {
      projectId: projectId,
      title: "",
      description: "",
      imageUrl: "",
      verified: false,
    },
  });

  function onSubmit(values: InsertProof) {
    mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset({ projectId, title: "", description: "", imageUrl: "", verified: false });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Camera className="w-4 h-4 mr-2" /> Add Proof
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Upload Verification Proof</DialogTitle>
          <DialogDescription>
            Document progress with photos or documents.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Foundation Pour Complete" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input placeholder="https://..." className="pl-9" {...field} />
                      <Upload className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    * For demo, use Unsplash URLs or placeholder images.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Details about what is being verified..." 
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-accent text-white hover:bg-accent/90">
                {isPending ? "Uploading..." : "Upload Proof"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
