import { useState } from "react";
import { useCompanyStore } from "@/hooks/use-company-store";
import { useCreateCompany } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Loader2 } from "lucide-react";

export default function CompanySetupPage() {
  const [name, setName] = useState("");
  const createCompany = useCreateCompany();
  const { setActiveCompanyId } = useCompanyStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createCompany.mutate({
      data: { name }
    }, {
      onSuccess: (company) => {
        setActiveCompanyId(company.id);
        toast({
          title: "Company created",
          description: "Welcome to Foreman AI.",
        });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Error creating company",
          description: String(error) || "Please try again.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-8">
          <div className="h-16 w-16 rounded-xl bg-primary flex items-center justify-center">
            <HardHat className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <Card className="border-border shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold uppercase tracking-wide">Create Company</CardTitle>
            <CardDescription>Set up your workspace to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="companyName" className="uppercase tracking-widest text-xs font-bold text-muted-foreground">Company Name</Label>
                <Input
                  id="companyName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Utility Construction"
                  className="h-12 text-lg"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg" 
                disabled={createCompany.isPending || !name.trim()}
              >
                {createCompany.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                {createCompany.isPending ? "Setting up..." : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
