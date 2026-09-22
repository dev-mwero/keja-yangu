import { createLocalStore } from "@/lib/local-store";

export type PaymentStatus = "paid" | "due" | "overdue";
export type PaymentMethod = "M-Pesa" | "Card" | "Bank";

export interface Payment {
  id: string;
  label: string;
  property: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
  autoPay: boolean;
  method?: PaymentMethod;
}

export type ComplaintStatus = "open" | "in-progress" | "resolved";
export type ComplaintPriority = "low" | "medium" | "high";
export type ComplaintCategory =
  | "Maintenance"
  | "Noise"
  | "Billing"
  | "Security"
  | "Neighbours"
  | "Other";

export interface Complaint {
  id: string;
  subject: string;
  category: ComplaintCategory;
  message: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  property: string;
  createdAt: string;
  updatedAt?: string;
  resolution?: string;
}

export type MessageSender = "me" | "them";

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string;
  at: string;
}

export interface ChatThread {
  id: string;
  contact: string;
  role: string;
  property: string;
  lastAt: string;
  unread: number;
  messages: ChatMessage[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  property: string;
  createdAt: string;
  pinned?: boolean;
  audience: "all" | "tenants" | "staff";
}

export type DocumentCategory = "lease" | "invoice" | "utility" | "notice" | "inspection" | "policy";
export type DocumentScope = "tenant" | "landlord" | "property";

export interface DashboardDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  scope: DocumentScope;
  property?: string;
  tenant?: string;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
}

export type TaskStatus = "open" | "in-progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface MaintenanceTask {
  id: string;
  title: string;
  property: string;
  propertyId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string;
  createdBy: "caretaker" | "owner";
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  notes?: string;
}

export type InvoiceStatus = "paid" | "pending" | "overdue";

export interface Invoice {
  id: string;
  number: string;
  tenant: string;
  tenantEmail: string;
  property: string;
  amount: number;
  period: string;
  dueDate: string;
  issuedAt: string;
  paidAt?: string;
  status: InvoiceStatus;
  method?: PaymentMethod;
}

export interface ContactThread {
  id: string;
  tenant: string;
  tenantEmail: string;
  property: string;
  lastAt: string;
  unread: number;
  messages: ChatMessage[];
}

export interface UserSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  moderationReminders: boolean;
  language: string;
  theme: "system" | "light" | "dark";
}

const fromNow = (days: number, hour = 10): string => {
  const date = new Date(Date.now() + days * 86400000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const paymentSeed: Payment[] = [
  {
    id: "pay-1",
    label: "April rent",
    property: "Sunlit Studio in Kilimani",
    amount: 45000,
    dueDate: fromNow(-5),
    paidDate: fromNow(-12, 9),
    status: "paid",
    autoPay: true,
    method: "M-Pesa",
  },
  {
    id: "pay-2",
    label: "May rent",
    property: "Sunlit Studio in Kilimani",
    amount: 45000,
    dueDate: fromNow(4),
    status: "due",
    autoPay: true,
  },
  {
    id: "pay-3",
    label: "Water bill",
    property: "Sunlit Studio in Kilimani",
    amount: 1250,
    dueDate: fromNow(8),
    status: "due",
    autoPay: false,
  },
  {
    id: "pay-4",
    label: "March rent",
    property: "Sunlit Studio in Kilimani",
    amount: 45000,
    dueDate: fromNow(-35),
    paidDate: fromNow(-38, 16),
    status: "paid",
    autoPay: true,
    method: "Bank",
  },
];

const complaintSeed: Complaint[] = [
  {
    id: "cpt-1",
    subject: "Loose bathroom tap",
    category: "Maintenance",
    message: "The bathroom tap is leaking and dripping through the night.",
    status: "in-progress",
    priority: "medium",
    property: "Sunlit Studio in Kilimani",
    createdAt: fromNow(-3, 9),
    updatedAt: fromNow(-1, 14),
  },
  {
    id: "cpt-2",
    subject: "Buzzer not working",
    category: "Maintenance",
    message: "The entrance buzzer is not responding since yesterday morning.",
    status: "open",
    priority: "high",
    property: "Sunlit Studio in Kilimani",
    createdAt: fromNow(-1, 8),
  },
  {
    id: "cpt-3",
    subject: "Noisy neighbours over the weekend",
    category: "Noise",
    message: "Loud music on Saturday night kept everyone awake.",
    status: "resolved",
    priority: "low",
    property: "Sunlit Studio in Kilimani",
    createdAt: fromNow(-20, 20),
    updatedAt: fromNow(-16, 11),
    resolution: "Spoke with the neighbours; quiet hours are now posted in the lobby.",
  },
];

const chatThreadSeed: ChatThread[] = [
  {
    id: "thr-1",
    contact: "John Kiprono",
    role: "Caretaker",
    property: "Sunlit Studio in Kilimani",
    lastAt: fromNow(-2, 17),
    unread: 1,
    messages: [
      {
        id: "m-1",
        sender: "me",
        text: "Hi John, quick question — are the backups for the gym sorted?",
        at: fromNow(-3, 10),
      },
      {
        id: "m-2",
        sender: "them",
        text: "Morning! Yes, the technician came by yesterday. Everything is working now.",
        at: fromNow(-3, 11),
      },
      {
        id: "m-3",
        sender: "me",
        text: "Perfect, thank you!",
        at: fromNow(-3, 11),
      },
      {
        id: "m-4",
        sender: "them",
        text: "Anytime. Also, water tanks are being cleaned Thursday morning.",
        at: fromNow(-2, 17),
      },
    ],
  },
  {
    id: "thr-2",
    contact: "D8 Property Group",
    role: "Landlord",
    property: "Sunlit Studio in Kilimani",
    lastAt: fromNow(-9, 15),
    unread: 0,
    messages: [
      {
        id: "m-5",
        sender: "them",
        text: "Renewal notice: your one-year lease ends next month. Let us know if you'd like to renew.",
        at: fromNow(-9, 15),
      },
    ],
  },
];

const announcementSeed: Announcement[] = [
  {
    id: "ann-1",
    title: "Water tank cleaning — Thursday morning",
    body: "Water tanks will be cleaned this Thursday from 7:00 AM to 11:00 AM. Expect low water pressure during that window. Please store enough water for the morning.",
    author: "John Kiprono",
    property: "All properties",
    createdAt: fromNow(-2, 8),
    pinned: true,
    audience: "tenants",
  },
  {
    id: "ann-2",
    title: "Gym back in service",
    body: "The gym equipment has been serviced and is fully operational again. Thank you for your patience.",
    author: "D8 Property Group",
    property: "Sunlit Studio in Kilimani",
    createdAt: fromNow(-6, 10),
    pinned: false,
    audience: "tenants",
  },
  {
    id: "ann-3",
    title: "New security roster for the month",
    body: "Attached is the updated security guard roster for the coming month. Ring the caretaker for any concern.",
    author: "D8 Property Group",
    property: "All properties",
    createdAt: fromNow(-14, 13),
    pinned: false,
    audience: "all",
  },
];

const tenantDocumentSeed: DashboardDocument[] = [
  {
    id: "doc-1",
    name: "Lease agreement — Sunlit Studio",
    category: "lease",
    scope: "tenant",
    property: "Sunlit Studio in Kilimani",
    uploadedBy: "D8 Property Group",
    uploadedAt: fromNow(-30),
    size: "1.4 MB",
  },
  {
    id: "doc-2",
    name: "April rent receipt",
    category: "invoice",
    scope: "tenant",
    property: "Sunlit Studio in Kilimani",
    uploadedBy: "D8 Property Group",
    uploadedAt: fromNow(-5),
    size: "180 KB",
  },
  {
    id: "doc-3",
    name: "Utility billing statement — April",
    category: "utility",
    scope: "tenant",
    property: "Sunlit Studio in Kilimani",
    uploadedBy: "John Kiprono",
    uploadedAt: fromNow(-3),
    size: "95 KB",
  },
  {
    id: "doc-4",
    name: "Move-in inspection report",
    category: "inspection",
    scope: "tenant",
    property: "Sunlit Studio in Kilimani",
    uploadedBy: "John Kiprono",
    uploadedAt: fromNow(-140),
    size: "420 KB",
  },
];

const taskSeed: MaintenanceTask[] = [
  {
    id: "task-1",
    title: "Fix dripping tap in unit 2",
    property: "Sunlit Studio in Kilimani",
    propertyId: "p1",
    priority: "medium",
    status: "in-progress",
    assignedTo: "John Kiprono",
    createdBy: "caretaker",
    dueDate: fromNow(1),
    createdAt: fromNow(-2),
  },
  {
    id: "task-2",
    title: "Cleaning water tanks",
    property: "Amber Heights",
    propertyId: "p6",
    priority: "high",
    status: "open",
    assignedTo: "Mercy Atieno",
    createdBy: "owner",
    dueDate: fromNow(1, 7),
    createdAt: fromNow(-3),
    notes: "Use the approved vendor; notify tenants two days before.",
  },
  {
    id: "task-3",
    title: "Replace lobby light bulbs",
    property: "Palmera Residences",
    propertyId: "p3",
    priority: "low",
    status: "done",
    assignedTo: "Mercy Atieno",
    createdBy: "caretaker",
    dueDate: fromNow(-2),
    createdAt: fromNow(-6),
    completedAt: fromNow(-2, 12),
  },
  {
    id: "task-4",
    title: "Inspect perimeter fencing",
    property: "Skyline Penthouse",
    propertyId: "p4",
    priority: "high",
    status: "open",
    assignedTo: "John Kiprono",
    createdBy: "owner",
    dueDate: fromNow(3),
    createdAt: fromNow(-1),
  },
  {
    id: "task-5",
    title: "Service the backup generator",
    property: "Amber Heights",
    propertyId: "p6",
    priority: "medium",
    status: "done",
    assignedTo: "Mercy Atieno",
    createdBy: "owner",
    dueDate: fromNow(-8),
    createdAt: fromNow(-12),
    completedAt: fromNow(-9, 15),
  },
];

const invoiceSeed: Invoice[] = [
  {
    id: "inv-1",
    number: "INV-2026-0041",
    tenant: "Amina Otieno",
    tenantEmail: "amina@kj.co",
    property: "Palmera Residences",
    amount: 120000,
    period: "April 2026",
    dueDate: fromNow(1),
    issuedAt: fromNow(-4),
    status: "paid",
    paidAt: fromNow(-1, 9),
    method: "M-Pesa",
  },
  {
    id: "inv-2",
    number: "INV-2026-0042",
    tenant: "Brian Kamau",
    tenantEmail: "brian@kj.co",
    property: "Terracotta Loft, Westlands",
    amount: 78000,
    period: "April 2026",
    dueDate: fromNow(2),
    issuedAt: fromNow(-4),
    status: "pending",
  },
  {
    id: "inv-3",
    number: "INV-2026-0043",
    tenant: "Cynthia Wairimu",
    tenantEmail: "cyn@kj.co",
    property: "Sunlit Studio in Kilimani",
    amount: 45000,
    period: "April 2026",
    dueDate: fromNow(3),
    issuedAt: fromNow(-4),
    status: "pending",
  },
  {
    id: "inv-4",
    number: "INV-2026-0038",
    tenant: "Amina Otieno",
    tenantEmail: "amina@kj.co",
    property: "Palmera Residences",
    amount: 120000,
    period: "March 2026",
    dueDate: fromNow(-27),
    issuedAt: fromNow(-34),
    status: "paid",
    paidAt: fromNow(-29, 10),
    method: "Bank",
  },
  {
    id: "inv-5",
    number: "INV-2026-0039",
    tenant: "Daniel Mwangi",
    tenantEmail: "dan@kj.co",
    property: "Cedar Cabin Room",
    amount: 18000,
    period: "March 2026",
    dueDate: fromNow(-26),
    issuedAt: fromNow(-34),
    status: "overdue",
  },
];

const contactThreadSeed: ContactThread[] = [
  {
    id: "ct-1",
    tenant: "Amina Otieno",
    tenantEmail: "amina@kj.co",
    property: "Palmera Residences",
    lastAt: fromNow(-1, 9),
    unread: 2,
    messages: [
      {
        id: "ctm-1",
        sender: "them",
        text: "Hi! I have paid this month's rent via M-Pesa as usual. Please confirm receipt.",
        at: fromNow(-1, 9),
      },
    ],
  },
  {
    id: "ct-2",
    tenant: "Cynthia Wairimu",
    tenantEmail: "cyn@kj.co",
    property: "Sunlit Studio in Kilimani",
    lastAt: fromNow(-4, 12),
    unread: 0,
    messages: [
      {
        id: "ctm-2",
        sender: "them",
        text: "Could the technician come this week for the bathroom tap? It's getting worse.",
        at: fromNow(-5, 10),
      },
      {
        id: "ctm-3",
        sender: "me",
        text: "Noted — he's scheduled for Thursday morning. I'll confirm the exact time.",
        at: fromNow(-4, 12),
      },
    ],
  },
  {
    id: "ct-3",
    tenant: "Brian Kamau",
    tenantEmail: "brian@kj.co",
    property: "Terracotta Loft, Westlands",
    lastAt: fromNow(-9, 8),
    unread: 0,
    messages: [
      {
        id: "ctm-4",
        sender: "them",
        text: "Is the loft still available to view on Saturday?",
        at: fromNow(-10, 16),
      },
      {
        id: "ctm-5",
        sender: "me",
        text: "Yes, 10 AM works. I'll meet you at the gate.",
        at: fromNow(-9, 8),
      },
    ],
  },
];

const defaultSettings: UserSettings = {
  emailNotifications: true,
  smsNotifications: true,
  marketingEmails: false,
  moderationReminders: true,
  language: "en",
  theme: "system",
};

export const paymentsStore = createLocalStore<Payment>("payments", () => paymentSeed);
export const complaintsStore = createLocalStore<Complaint>("complaints", () => complaintSeed);
export const chatThreadsStore = createLocalStore<ChatThread>("chat-threads", () => chatThreadSeed);
export const announcementsStore = createLocalStore<Announcement>(
  "announcements",
  () => announcementSeed,
);
export const documentsStore = createLocalStore<DashboardDocument>(
  "documents",
  () => tenantDocumentSeed,
);
export const tasksStore = createLocalStore<MaintenanceTask>("tasks", () => taskSeed);
export const invoicesStore = createLocalStore<Invoice>("invoices", () => invoiceSeed);
export const contactThreadsStore = createLocalStore<ContactThread>(
  "contact-threads",
  () => contactThreadSeed,
);
export const settingsStore = createLocalStore<UserSettings & { id: string }>("settings", () => [
  { id: "default", ...defaultSettings },
]);

export const updateSettings = (
  store: ReturnType<typeof createLocalStore<UserSettings & { id: string }>>,
  patch: Partial<UserSettings>,
): void => {
  const current = store.readAll()[0] ?? { id: "default", ...defaultSettings };
  store.writeAll([{ ...current, ...patch }]);
};
