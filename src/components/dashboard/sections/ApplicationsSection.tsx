import { CheckCircle2, Clock, XCircle, FileText, Trash2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useTenantApplications } from "@/hooks/use-applications";
import { cancelApplication, ApplicationStatus } from "@/lib/applications";

const statusIcon: Record<ApplicationStatus, JSX.Element> = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  pending: <Clock className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const statusClass: Record<ApplicationStatus, string> = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

export const ApplicationsSection = () => {
  const { user } = useAuth();
  const { applications, refresh } = useTenantApplications(user?.email);
  const { toast } = useToast();

  if (!applications.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
        <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-xl">No applications yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse available homes and apply — your status will appear here.
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/properties">Browse properties</Link>
        </Button>
      </div>
    );
  }

  const handleCancel = (id: string) => {
    if (!user) return;
    if (cancelApplication(id, user.email)) {
      toast({ title: "Application withdrawn" });
      refresh();
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">
                <Link to={`/properties/${a.propertyId}`} className="hover:underline">
                  {a.propertyTitle}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(a.submittedAt)}</TableCell>
              <TableCell>
                <Badge className={`${statusClass[a.status]} gap-1 capitalize hover:opacity-100`}>
                  {statusIcon[a.status]}
                  {a.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {a.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleCancel(a.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Withdraw
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/dashboard/tenant/applications/${a.id}`}>
                      Details <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};