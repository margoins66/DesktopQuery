import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/components/layout/AppShell";
import { BackendGate } from "@/components/BackendGate";
import { UpdateBanner } from "@/components/UpdateBanner";
import NotFound from "@/pages/not-found";

// Placeholder imports for pages
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Documents from "@/pages/Documents";
import Search from "@/pages/Search";
import Comparisons from "@/pages/Comparisons";
import Summaries from "@/pages/Summaries";
import Download from "@/pages/Download";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/chat" component={Chat} />
        <Route path="/documents" component={Documents} />
        <Route path="/search" component={Search} />
        <Route path="/comparisons" component={Comparisons} />
        <Route path="/summaries" component={Summaries} />
        <Route path="/download" component={Download} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <BackendGate>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </BackendGate>
          <UpdateBanner />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
