import * as React from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { Home, FileText, Users, HardHat, Settings, LogOut, Loader2, Building, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetMe, useListCompanyMembers, getGetMeQueryKey, getListCompanyMembersQueryKey } from "@workspace/api-client-react";

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { activeCompanyId } = useCompanyStore();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  
  const { data: userProfile } = useGetMe({ 
    query: { 
      enabled: !!user,
      queryKey: getGetMeQueryKey()
    } 
  });
  
  const { data: companyMembers } = useListCompanyMembers(activeCompanyId!, {
    query: {
      enabled: !!activeCompanyId,
      queryKey: getListCompanyMembersQueryKey(activeCompanyId!)
    }
  });
  
  const currentMember = companyMembers?.find(m => m.userId === userProfile?.id);
  const role = currentMember?.role || 'foreman';

  const navItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: Home,
      roles: ['foreman', 'supervisor', 'admin']
    },
    {
      title: "Reports",
      href: "/reports",
      icon: FileText,
      roles: ['foreman', 'supervisor', 'admin']
    },
    {
      title: "Crews",
      href: "/crews",
      icon: Users,
      roles: ['foreman', 'supervisor', 'admin']
    },
    {
      title: "Projects",
      href: "/projects",
      icon: HardHat,
      roles: ['foreman', 'supervisor', 'admin']
    }
  ];

  if (role === 'supervisor' || role === 'admin') {
    navItems.splice(1, 0, {
      title: "Supervisor View",
      href: "/dashboard/supervisor",
      icon: ShieldAlert,
      roles: ['supervisor', 'admin']
    });
  }

  if (role === 'admin') {
    navItems.splice(2, 0, {
      title: "Admin View",
      href: "/dashboard/admin",
      icon: Building,
      roles: ['admin']
    });
  }

  return (
    <div className="flex h-screen w-20 md:w-64 flex-col bg-card border-r shadow-sm">
      <div className="flex h-16 items-center justify-center md:justify-start md:px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <HardHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="hidden md:block text-xl font-bold uppercase tracking-tight">Foreman AI</span>
        </Link>
      </div>

      <div className="flex-1 overflow-auto py-6 flex flex-col gap-2 px-3">
        {navItems.filter(item => item.roles.includes(role)).map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={location === item.href || (item.href !== '/dashboard' && location.startsWith(item.href)) ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-center md:justify-start h-14 md:h-12",
                location === item.href || (item.href !== '/dashboard' && location.startsWith(item.href)) ? "bg-secondary" : ""
              )}
            >
              <item.icon className="h-6 w-6 md:mr-3 md:h-5 md:w-5" />
              <span className="hidden md:block font-bold">{item.title}</span>
            </Button>
          </Link>
        ))}
      </div>

      <div className="border-t border-border p-3 flex flex-col gap-2">
        <Link href="/settings">
          <Button variant="ghost" className="w-full justify-center md:justify-start h-14 md:h-12">
            <Settings className="h-6 w-6 md:mr-3 md:h-5 md:w-5" />
            <span className="hidden md:block font-bold">Settings</span>
          </Button>
        </Link>
        <Button 
          variant="ghost" 
          className="w-full justify-center md:justify-start h-14 md:h-12 text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
        >
          <LogOut className="h-6 w-6 md:mr-3 md:h-5 md:w-5" />
          <span className="hidden md:block font-bold">Log out</span>
        </Button>
      </div>
    </div>
  );
}
