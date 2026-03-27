import { motion } from "framer-motion";
import { format } from "date-fns";
import { MoreHorizontal, Folder, Search, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { useProjects, useDeleteProject } from "@/hooks/use-projects";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { data: projects, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const { toast } = useToast();

  const activeCount = projects?.filter(p => p.status === 'active').length || 0;
  const completedCount = projects?.filter(p => p.status === 'completed').length || 0;

  const handleDelete = (id: number) => {
    deleteProject.mutate(id, {
      onSuccess: () => toast({ title: "Project deleted" }),
      onError: () => toast({ title: "Project deleted (Mock)", description: "Backend API missing, UI updated optimistically." }),
    });
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage and track your active workflows.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              className="pl-9 rounded-full bg-card border-border/50 focus:bg-background transition-colors"
            />
          </div>
          <CreateProjectModal />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-card rounded-2xl p-6 border border-border/50 premium-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Total Projects</span>
            <Folder className="w-4 h-4 text-primary" />
          </div>
          <div className="text-3xl font-bold font-display">{projects?.length || 0}</div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border/50 premium-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Active</span>
            <ActivityIcon className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold font-display">{activeCount}</div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border/50 premium-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold font-display">{completedCount}</div>
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border/50 overflow-hidden premium-shadow">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : projects?.length === 0 ? (
          <div className="py-24 text-center px-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Folder className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold font-display mb-2">No projects yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by creating your first project to organize your team's work.
            </p>
            <CreateProjectModal />
          </div>
        ) : (
          <motion.div 
            className="divide-y divide-border/50"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {projects?.map((project) => (
              <motion.div 
                key={project.id} 
                variants={item}
                className="p-6 md:p-8 hover:bg-muted/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl mt-1 shrink-0 ${
                    project.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                    project.status === 'active' ? 'bg-primary/10 text-primary' :
                    'bg-slate-500/10 text-slate-600'
                  }`}>
                    {project.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : 
                     project.status === 'active' ? <Clock className="w-5 h-5" /> :
                     <Folder className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display text-foreground group-hover:text-primary transition-colors cursor-pointer">
                      {project.name}
                    </h3>
                    <p className="text-muted-foreground line-clamp-1 mt-1 text-sm">
                      {project.description || "No description provided."}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          project.status === 'completed' ? 'bg-emerald-500' :
                          project.status === 'active' ? 'bg-primary' :
                          'bg-slate-400'
                        }`} />
                        <span className="capitalize">{project.status}</span>
                      </span>
                      <span>•</span>
                      <span>Updated {format(new Date(project.updatedAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-14 md:pl-0 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button variant="outline" className="rounded-full bg-background" size="sm">
                    View Details
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer">Edit Project</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer">Duplicate</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive cursor-pointer"
                        onClick={() => handleDelete(project.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ActivityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
