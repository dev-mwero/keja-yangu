import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Properties from "./pages/Properties.tsx";
import PropertyDetails from "./pages/PropertyDetails.tsx";
import TenantDashboard from "./pages/dashboards/TenantDashboard.tsx";
import CaretakerDashboard from "./pages/dashboards/CaretakerDashboard.tsx";
import OwnerDashboard from "./pages/dashboards/OwnerDashboard.tsx";
import {
  OwnerPortfolioPage,
  OwnerTasksPage,
  OwnerAccountingPage,
  OwnerReportsPage,
  OwnerCommunicationsPage,
  OwnerSettingsPage,
} from "./pages/dashboards/owner/OwnerSections.tsx";
import {
  CaretakerPortfolioPage,
  CaretakerTasksPage,
  CaretakerAccountingPage,
  CaretakerReportsPage,
  CaretakerCommunicationsPage,
  CaretakerSettingsPage,
} from "./pages/dashboards/caretaker/CaretakerSections.tsx";
import Auth from "./pages/Auth.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<RedirectIfAuthenticated><Index /></RedirectIfAuthenticated>} />
              <Route path="/auth" element={<RedirectIfAuthenticated><Auth /></RedirectIfAuthenticated>} />
              <Route path="/properties" element={<Properties />} />
              <Route path="/properties/:id" element={<PropertyDetails />} />
              <Route
                path="/dashboard/tenant"
                element={
                  <ProtectedRoute allow="tenant">
                    <TenantDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/caretaker"
                element={
                  <ProtectedRoute allow="caretaker">
                    <CaretakerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/dashboard/caretaker/portfolio" element={<ProtectedRoute allow="caretaker"><CaretakerPortfolioPage /></ProtectedRoute>} />
              <Route path="/dashboard/caretaker/tasks" element={<ProtectedRoute allow="caretaker"><CaretakerTasksPage /></ProtectedRoute>} />
              <Route path="/dashboard/caretaker/accounting" element={<ProtectedRoute allow="caretaker"><CaretakerAccountingPage /></ProtectedRoute>} />
              <Route path="/dashboard/caretaker/reports" element={<ProtectedRoute allow="caretaker"><CaretakerReportsPage /></ProtectedRoute>} />
              <Route path="/dashboard/caretaker/communications" element={<ProtectedRoute allow="caretaker"><CaretakerCommunicationsPage /></ProtectedRoute>} />
              <Route path="/dashboard/caretaker/settings" element={<ProtectedRoute allow="caretaker"><CaretakerSettingsPage /></ProtectedRoute>} />
              <Route
                path="/dashboard/owner"
                element={
                  <ProtectedRoute allow="owner">
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/dashboard/owner/portfolio" element={<ProtectedRoute allow="owner"><OwnerPortfolioPage /></ProtectedRoute>} />
              <Route path="/dashboard/owner/tasks" element={<ProtectedRoute allow="owner"><OwnerTasksPage /></ProtectedRoute>} />
              <Route path="/dashboard/owner/accounting" element={<ProtectedRoute allow="owner"><OwnerAccountingPage /></ProtectedRoute>} />
              <Route path="/dashboard/owner/reports" element={<ProtectedRoute allow="owner"><OwnerReportsPage /></ProtectedRoute>} />
              <Route path="/dashboard/owner/communications" element={<ProtectedRoute allow="owner"><OwnerCommunicationsPage /></ProtectedRoute>} />
              <Route path="/dashboard/owner/settings" element={<ProtectedRoute allow="owner"><OwnerSettingsPage /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
