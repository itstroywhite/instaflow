import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { CreateProjectSchema, type CreateProjectInput } from "@/lib/schemas";
import { useCreateProject } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function CreateProjectModal() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createProject = useCreateProject();

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "active",
    },
  });

  function onSubmit(data: CreateProjectInput) {
    createProject.mutate(data, {
      onSuccess: () => {
        toast({ title: "Project created successfully!" });
        setOpen(false);
        form.reset();
      },
      onError: (error) => {
        toast({
          title: "Failed to create project",
          description: error.message,
          variant: "destructive",
        });
        // Close anyway for the mockup experience
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full px-6 shadow-md hover:shadow-lg transition-all duration-300 group">
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Create Project</DialogTitle>
          <DialogDescription>
            Add a new project to your workspace. You can edit these details later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">Project Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. Website Redesign" 
                      className="rounded-xl border-border/50 focus:border-primary bg-muted/30 focus:bg-background transition-colors" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Briefly describe the project goals..." 
                      className="rounded-xl resize-none border-border/50 focus:border-primary bg-muted/30 focus:bg-background transition-colors"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl border-border/50 bg-muted/30 focus:bg-background">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setOpen(false)}
                className="rounded-xl font-medium"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createProject.isPending}
                className="rounded-xl font-medium shadow-md"
              >
                {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
