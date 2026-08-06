import { useEffect, useRef, useState } from "react";
import { type DailyReportDetail, useUpdateReport, getGetReportQueryKey, useParseDictation } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function StepSummary({ report }: { report: DailyReportDetail }) {
  const updateReport = useUpdateReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [workPerformed, setWorkPerformed] = useState(report.workPerformed || "");
  const [weatherConditions, setWeatherConditions] = useState(report.weatherConditions || "");
  const [delays, setDelays] = useState(report.delays || "");
  const [safetyMeeting, setSafetyMeeting] = useState(report.safetyMeeting || false);
  const [injuries, setInjuries] = useState(report.injuries || false);
  const [injuryDetails, setInjuryDetails] = useState(report.injuryDetails || "");

  const lastSavedRef = useRef({
    workPerformed, weatherConditions, delays, safetyMeeting, injuries, injuryDetails
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = { workPerformed, weatherConditions, delays, safetyMeeting, injuries, injuryDetails };
      if (JSON.stringify(current) !== JSON.stringify(lastSavedRef.current)) {
        updateReport.mutate({
          reportId: report.id,
          data: current
        }, {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetReportQueryKey(report.id), (old: any) => old ? { ...old, ...data } : old);
          }
        });
        lastSavedRef.current = current;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [workPerformed, weatherConditions, delays, safetyMeeting, injuries, injuryDetails, report.id, updateReport, queryClient]);

  // Mock Dictation functionality
  const parseDictation = useParseDictation();
  const [isListening, setIsListening] = useState(false);

  const handleSimulateDictation = () => {
    setIsListening(true);
    // Simulate recording time
    setTimeout(() => {
      setIsListening(false);
      const text = "We installed three 40 foot class 3 poles at the north end. Weather was sunny. Held safety meeting about proper lifting. No injuries today.";
      
      parseDictation.mutate({
        data: { text, reportId: report.id }
      }, {
        onSuccess: (res) => {
          if (res.isMocked) {
            toast({
              title: "AI Parsing Complete (Mock)",
              description: "Review the filled fields.",
            });
          }
          if (res.parsedFields.workPerformed) setWorkPerformed(res.parsedFields.workPerformed);
          if (res.parsedFields.weatherConditions) setWeatherConditions(res.parsedFields.weatherConditions);
          if (res.parsedFields.safetyMeeting !== undefined) setSafetyMeeting(res.parsedFields.safetyMeeting ?? false);
          if (res.parsedFields.injuries !== undefined) setInjuries(res.parsedFields.injuries ?? false);
        }
      });
    }, 2000);
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-primary/10 p-6 rounded-xl border border-primary/20">
        <div>
          <h3 className="font-bold text-lg text-primary flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> Foreman AI Assistant
          </h3>
          <p className="text-muted-foreground text-sm mt-1">Dictate your end-of-day summary and let AI fill in the blanks.</p>
        </div>
        <Button 
          size="lg" 
          variant={isListening ? "destructive" : "default"}
          className={`gap-2 ${isListening ? "animate-pulse" : ""}`}
          onClick={handleSimulateDictation}
          disabled={parseDictation.isPending}
        >
          {isListening ? (
            <><Mic className="h-5 w-5" /> Listening...</>
          ) : parseDictation.isPending ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
          ) : (
            <><Mic className="h-5 w-5" /> Start Dictation (Simulate)</>
          )}
        </Button>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <Label>Work Performed</Label>
          <textarea 
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium min-h-[120px] resize-y"
            value={workPerformed}
            onChange={(e) => setWorkPerformed(e.target.value)}
            placeholder="Describe what was accomplished today..."
          />
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Weather Conditions</Label>
            <Input value={weatherConditions} onChange={(e) => setWeatherConditions(e.target.value)} placeholder="e.g. Sunny, 85F" />
          </div>
          <div className="space-y-3">
            <Label>Delays or Issues</Label>
            <Input value={delays} onChange={(e) => setDelays(e.target.value)} placeholder="e.g. Waiting on materials" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 p-6 border border-border rounded-xl bg-secondary/20">
          <div>
            <h4 className="font-bold uppercase tracking-wide mb-4">Safety Meeting</h4>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setSafetyMeeting(!safetyMeeting)}
                className={`w-10 h-10 rounded flex items-center justify-center border-2 transition-colors ${safetyMeeting ? 'bg-primary border-primary text-primary-foreground' : 'border-input hover:border-primary'}`}
              >
                {safetyMeeting && <CheckIcon />}
              </button>
              <span className="font-semibold text-lg">Held daily safety brief</span>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wide mb-4 text-destructive">Incidents</h4>
            <div className="flex items-center gap-3 mb-4">
              <button 
                type="button"
                onClick={() => setInjuries(!injuries)}
                className={`w-10 h-10 rounded flex items-center justify-center border-2 transition-colors ${injuries ? 'bg-destructive border-destructive text-destructive-foreground' : 'border-input hover:border-destructive'}`}
              >
                {injuries && <CheckIcon />}
              </button>
              <span className="font-semibold text-lg">Injuries Occurred</span>
            </div>
            {injuries && (
              <div className="space-y-3">
                <Label className="text-destructive">Injury Details</Label>
                <textarea 
                  className="flex w-full rounded-md border-2 border-destructive/50 bg-destructive/5 px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive font-medium min-h-[80px]"
                  value={injuryDetails}
                  onChange={(e) => setInjuryDetails(e.target.value)}
                  placeholder="Describe the incident..."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
