import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

import LandingPage from "@/pages/landing";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import DashboardPage from "@/pages/dashboard/index";
import SupervisorDashboardPage from "@/pages/dashboard/supervisor";
import AdminDashboardPage from "@/pages/dashboard/admin";
import CompanySetupPage from "@/pages/company/setup";
import ReportsListPage from "@/pages/reports/index";
import ReportCreatePage from "@/pages/reports/new";
import ReportEditPage from "@/pages/reports/edit";
import ReportDetailPage from "@/pages/reports/detail";
import ReportPrintPage from "@/pages/reports/print";
import BillingReviewPage from "@/pages/reports/billing-review";
import CrewsListPage from "@/pages/crews/index";
import CrewDetailPage from "@/pages/crews/detail";
import ProjectsListPage from "@/pages/projects/index";
import SettingsPage from "@/pages/settings";
import RatesSettingsPage from "@/pages/settings/rates";
import PoleKnowledgeCenterPage from "@/pages/settings/pkb/index";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, useListCompanies, useUpsertMe, getListCompaniesQueryKey } from "@workspace/api-client-react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "next-themes";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(38 100% 50%)",
    colorForeground: "hsl(0 0% 98%)",
    colorMutedForeground: "hsl(220 15% 65%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(220 15% 12%)",
    colorInput: "hsl(220 15% 25%)",
    colorInputForeground: "hsl(0 0% 98%)",
    colorNeutral: "hsl(220 15% 20%)",
    fontFamily: "'Outfit', sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-xl border border-border w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold text-2xl",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-semibold",
    formFieldLabel: "text-foreground font-semibold uppercase tracking-wide text-xs",
    footerActionLink: "text-primary hover:text-primary/80 font-bold",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 uppercase font-bold tracking-wide",
    formFieldInput: "bg-input border-border text-foreground rounded-md",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

// Ensure local user profile exists and handle company setup
function ProtectedRoute({ component: Component, hideLayout = false }: { component: React.ComponentType, hideLayout?: boolean }) {
  const { user } = useClerk();
  const { activeCompanyId, setActiveCompanyId } = useCompanyStore();
  const upsertMe = useUpsertMe();
  
  // Profile provision
  useEffect(() => {
    if (user) {
      upsertMe.mutate({
        data: {
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined,
          email: user.primaryEmailAddress?.emailAddress,
        }
      });
    }
  }, [user]);

  const { data: companies, isLoading: isLoadingCompanies } = useListCompanies({
    query: {
      enabled: !!user,
      queryKey: getListCompaniesQueryKey()
    }
  });

  useEffect(() => {
    if (companies && companies.length > 0 && !activeCompanyId) {
      setActiveCompanyId(companies[0].id);
    }
  }, [companies, activeCompanyId, setActiveCompanyId]);

  if (!user) return <Redirect to="/sign-in" />;
  
  if (isLoadingCompanies) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  // If we are not on the company setup page and we have no companies, redirect to setup
  if ((!companies || companies.length === 0) && window.location.pathname !== `${basePath}/companies/setup`) {
    return <Redirect to="/companies/setup" />;
  }

  if (hideLayout) return <Component />;

  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        
        {/* Protected Routes */}
        <Route path="/dashboard">
          {() => <ProtectedRoute component={DashboardPage} />}
        </Route>
        <Route path="/dashboard/supervisor">
          {() => <ProtectedRoute component={SupervisorDashboardPage} />}
        </Route>
        <Route path="/dashboard/admin">
          {() => <ProtectedRoute component={AdminDashboardPage} />}
        </Route>
        <Route path="/reports">
          {() => <ProtectedRoute component={ReportsListPage} />}
        </Route>
        <Route path="/reports/new">
          {() => <ProtectedRoute component={ReportCreatePage} />}
        </Route>
        <Route path="/reports/:id/edit">
          {(params) => <ProtectedRoute component={() => <ReportEditPage id={parseInt(params.id)} />} />}
        </Route>
        <Route path="/reports/:id">
          {(params) => <ProtectedRoute component={() => <ReportDetailPage id={parseInt(params.id)} />} />}
        </Route>
        <Route path="/reports/:id/billing">
          {(params) => <ProtectedRoute component={() => <BillingReviewPage id={parseInt(params.id)} />} />}
        </Route>
        <Route path="/reports/:id/print">
          {(params) => <ProtectedRoute hideLayout component={() => <ReportPrintPage id={parseInt(params.id)} />} />}
        </Route>
        <Route path="/crews">
          {() => <ProtectedRoute component={CrewsListPage} />}
        </Route>
        <Route path="/crews/:id">
          {(params) => <ProtectedRoute component={() => <CrewDetailPage id={parseInt(params.id)} />} />}
        </Route>
        <Route path="/projects">
          {() => <ProtectedRoute component={ProjectsListPage} />}
        </Route>
        <Route path="/companies/setup">
          {() => <ProtectedRoute hideLayout component={CompanySetupPage} />}
        </Route>
        <Route path="/settings">
          {() => <ProtectedRoute component={SettingsPage} />}
        </Route>
        <Route path="/settings/rates">
          {() => <ProtectedRoute component={RatesSettingsPage} />}
        </Route>
        <Route path="/settings/pkb/:section">
          {(params) => <ProtectedRoute component={() => <PoleKnowledgeCenterPage section={params.section} />} />}
        </Route>
        <Route path="/settings/pkb">
          {() => <ProtectedRoute component={() => <PoleKnowledgeCenterPage section="pole-types" />} />}
        </Route>
      </Switch>
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <ClerkProviderWithRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
