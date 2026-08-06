import { useState, useEffect } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useGetCompany, getGetCompanyQueryKey, useUpdateCompany, useGetMe, useUpsertMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { activeCompanyId } = useCompanyStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading: isLoadingCompany } = useGetCompany(activeCompanyId!, {
    query: {
      enabled: !!activeCompanyId,
      queryKey: getGetCompanyQueryKey(activeCompanyId!)
    }
  });

  const { data: userProfile, isLoading: isLoadingProfile } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey()
    }
  });

  const updateCompany = useUpdateCompany();
  const upsertMe = useUpsertMe();

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (company) setCompanyName(company.name);
  }, [company]);

  useEffect(() => {
    if (userProfile) {
      setFirstName(userProfile.firstName || "");
      setLastName(userProfile.lastName || "");
    }
  }, [userProfile]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompany.mutate({
      companyId: activeCompanyId!,
      data: { name: companyName }
    }, {
      onSuccess: () => {
        toast({ title: "Company updated" });
        queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(activeCompanyId!) });
      }
    });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMe.mutate({
      data: { firstName, lastName }
    }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    });
  };

  if (isLoadingCompany || isLoadingProfile) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8 max-w-3xl">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight uppercase">Settings</h1>
        <p className="text-muted-foreground font-medium text-lg mt-1">Manage your profile and workspace</p>
      </div>
      
      <div className="grid gap-8">
        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide font-bold">Personal Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={userProfile?.email || ""} disabled className="bg-secondary/50" />
                <p className="text-xs text-muted-foreground font-medium">Email cannot be changed here.</p>
              </div>
              <Button type="submit" className="font-bold gap-2" disabled={upsertMe.isPending}>
                {upsertMe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="uppercase tracking-wide font-bold">Company Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveCompany} className="space-y-6">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <Button type="submit" className="font-bold gap-2" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Company
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
