import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { SectionPage } from "@/components/dashboard/SectionPage";
import { tenantNav } from "@/config/dashboardNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Application,
  ApplicationStatus,
  cancelApplication,
  getApplicationById,
  subscribeApplications,
} from "@/lib/applications";

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

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

interface TimelineStep {
  key: string;
  label: string;
  description: string;
  icon: JSX.Element;
  state: "done" | "current" | "upcoming" | "rejected";
  timestamp?: string;
}

const buildTimeline = (app: Application): TimelineStep[] => {
  const submitted: TimelineStep = {
    key: "submitted",
    label: "Application submitted",
    description: "We received your application and forwarded it to the property admin.",
    icon: <Send className="h-4 w-4" />,
    state: "done",
    timestamp: app.submittedAt,
  };

  if (app.status === "pending") {
    return [
      submitted,
      {
        key: "review",
        label: "Under review",
        description: "An owner or caretaker is reviewing your details.",
        icon: <Clock className="h-4 w-4" />,
        state: "current",
      },
      {
        key: "decision",
        label: "Decision",
        description: "You'll be notified as soon as a decision is made.",
        icon: <CheckCircle2 className="h-4 w-4" />,
        state: "upcoming",
      },
    ];
  }

  if (app.status === "approved") {
    return [
      submitted,
      {
        key: "review",
        label: "Reviewed",
        description: app.decisionNote || "Your application was reviewed by the property admin.",
        icon: <Clock className="h-4 w-4" />,
        state: "done",
        timestamp: app.decidedAt,
      },
      {
        key: "approved",
        label: "Approved",
        description: "Congratulations — the admin approved your application.",
        icon: <CheckCircle2 className="h-4 w-4" />,
        state: "done",
        timestamp: app.decidedAt,
      },
    ];
  }

  return [
    submitted,
    {
      key: "review",
      label: "Reviewed",
      description: app.decisionNote || "Your application was reviewed by the property admin.",
      icon: <Clock className="h-4 w-4" />,
      state: "done",
      timestamp: app.decidedAt,
    },
    {
      key: "rejected",
      label: "Rejected",
      description: "Unfortunately the admin couldn't move forward with this application.",
      icon: <XCircle className="h-4 w-4" />,
      state: "rejected",
      timestamp: app.decidedAt,
    },
  ];
};

const TenantApplicationDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tick, setTick] = useState(0);

  // Re-read on storage changes so withdraw/decision updates reflect immediately.
  useEffect(() => subscribeApplications(() => setTick((n) => n + 1)), []);

  const application = useMemo(() => (id ? getApplicationById(id) : undefined), [id, tick]);

  const isOwner =
    application && user && application.tenantEmail.toLowerCase() === user.email.toLowerCase();

  const handleWithdraw = () => {
    if (!application || !user) return;
    if (cancelApplication(application.id, user.email)) {
      toast({ title: "Application withdrawn" });
      navigate("/dashboard/tenant/applications");
    }
  };

  if (!application || !isOwner) {
    return (
      <SectionPage
        role="Tenant"
        nav={tenantNav}
        title="Application not found"
        subtitle="We couldn't load this application."
        icon={FileText}
        tagline="It may have been withdrawn or belongs to another account."
      >
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/dashboard/tenant/applications">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to applications
          </Link>
        </Button>
      </SectionPage>
    );
  }

  const timeline = buildTimeline(application);

  return (
    <SectionPage
      role="Tenant"
      nav={tenantNav}
      title={application.propertyTitle}
      subtitle="Application details"
      icon={FileText}
      tagline="Everything you submitted, plus the latest update from the property admin."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/tenant/applications">
            <ArrowLeft className="mr-2 h-4 w-4" /> All applications
          </Link>
        </Button>
        <Badge className={`${statusClass[application.status]} gap-1 capitalize hover:opacity-100`}>
          {statusIcon[application.status]} {application.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Property + submitted info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-lg font-semibold">Property</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The home you applied for.
            </p>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{application.propertyTitle}</p>
                <p className="text-xs text-muted-foreground">ID · {application.propertyId}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to={`/properties/${application.propertyId}`}>View listing</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-lg font-semibold">Submitted information</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              What we shared with the property admin.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
                  <dd className="font-medium">{application.applicantName}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
                  <dd className="font-medium">{application.applicantEmail}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Message</dt>
                  <dd className="whitespace-pre-line text-sm">
                    {application.message || (
                      <span className="text-muted-foreground">No message included.</span>
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Submitted</dt>
                  <dd className="font-medium">{formatDateTime(application.submittedAt)}</dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        {/* Timeline + actions */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-lg font-semibold">Decision timeline</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Each step shows where your application sits with the admin.
            </p>
            <ol className="mt-5 space-y-5">
              {timeline.map((step, i) => {
                const isLast = i === timeline.length - 1;
                const dotClass =
                  step.state === "done"
                    ? "bg-success/15 text-success ring-success/30"
                    : step.state === "current"
                      ? "bg-warning/15 text-warning ring-warning/30 animate-pulse"
                      : step.state === "rejected"
                        ? "bg-destructive/15 text-destructive ring-destructive/30"
                        : "bg-muted text-muted-foreground ring-border";
                return (
                  <li key={step.key} className="relative flex gap-4">
                    {!isLast && (
                      <span className="absolute left-[18px] top-9 h-full w-px bg-border" aria-hidden />
                    )}
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ${dotClass}`}
                    >
                      {step.icon}
                    </span>
                    <div className="flex-1 pb-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{step.label}</p>
                        {step.timestamp && (
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(step.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-lg font-semibold">Actions</h3>
            {application.status === "pending" ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can withdraw while the admin hasn't decided yet. This can't be undone.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="mt-4 rounded-full">
                      <Trash2 className="mr-2 h-4 w-4" /> Withdraw application
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Withdraw this application?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll need to apply again if you change your mind. The property admin
                        will no longer see your request.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleWithdraw}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, withdraw
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                A decision has been made — withdrawal is no longer available.
              </p>
            )}
          </div>
        </div>
      </div>
    </SectionPage>
  );
};

export default TenantApplicationDetails;