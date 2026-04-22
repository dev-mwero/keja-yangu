import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Properties from "./pages/Properties.tsx";
import PropertyDetails from "./pages/PropertyDetails.tsx";
import TenantDashboard from "./pages/dashboards/TenantDashboard.tsx";
import CaretakerDashboard from "./pages/dashboards/CaretakerDashboard.tsx";
import OwnerDashboard from "./pages/dashboards/OwnerDashboard.tsx";
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
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
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
              <Route
                path="/dashboard/owner"
                element={
                  <ProtectedRoute allow="owner">
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />
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
