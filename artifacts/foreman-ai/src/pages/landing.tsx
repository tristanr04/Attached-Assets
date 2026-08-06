import { Redirect } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { HardHat, CheckCircle2, Zap, Clock } from "lucide-react";

export default function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <header className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-primary flex items-center justify-center">
            <HardHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold uppercase tracking-widest">Foreman AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-bold">Login</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-bold">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 md:py-32 flex flex-col items-center text-center">
          <Badge className="mb-6 px-4 py-1.5 text-sm">Built for the field</Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight mb-8">
            Paperwork <span className="text-primary">eliminated.</span><br />
            Get off the site faster.
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mb-12">
            The mobile-first daily reporting tool for utility and powerline foremen. Voice dictation, auto-populated hours, and zero bullshit.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/sign-up" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-lg h-16 px-10">Start Your Free Trial</Button>
            </Link>
          </div>
        </section>

        <section className="bg-card border-y border-border py-24">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
                  <Zap className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">Voice Dictation</h3>
                <p className="text-muted-foreground">Don't type. Just talk. Our AI parses your work summary, delays, and materials automatically.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
                  <Clock className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">Save Hours</h3>
                <p className="text-muted-foreground">Pre-populated crew hours, materials catalogs, and quick-add equipment lists.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">Audit Ready</h3>
                <p className="text-muted-foreground">Generate clean, professional PDF reports ready for safety audits and utility billing.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        <p className="font-medium">&copy; {new Date().getFullYear()} Foreman AI. All rights reserved.</p>
      </footer>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`inline-flex items-center rounded-full border border-primary/20 bg-primary/10 text-primary font-bold uppercase tracking-wider ${className}`}>
      {children}
    </div>
  );
}
