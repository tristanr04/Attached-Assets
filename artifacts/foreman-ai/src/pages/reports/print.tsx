import { 
  useGetReport, getGetReportQueryKey, 
  useGetCompany, getGetCompanyQueryKey,
  useListTimeEntries, getListTimeEntriesQueryKey,
  useListReportMaterials, getListReportMaterialsQueryKey,
  useListReportEquipment, getListReportEquipmentQueryKey
} from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ReportPrintPage({ id }: { id: number }) {
  const { data: report, isLoading: isLoadingReport } = useGetReport(id, {
    query: {
      enabled: !!id,
      queryKey: getGetReportQueryKey(id)
    }
  });

  const { data: company, isLoading: isLoadingCompany } = useGetCompany(report?.companyId || 0, {
    query: {
      enabled: !!report?.companyId,
      queryKey: getGetCompanyQueryKey(report?.companyId || 0)
    }
  });

  const { data: timeEntries = [] } = useListTimeEntries(id, {
    query: { enabled: !!id, queryKey: getListTimeEntriesQueryKey(id) }
  });

  const { data: materials = [] } = useListReportMaterials(id, {
    query: { enabled: !!id, queryKey: getListReportMaterialsQueryKey(id) }
  });

  const { data: equipment = [] } = useListReportEquipment(id, {
    query: { enabled: !!id, queryKey: getListReportEquipmentQueryKey(id) }
  });

  if (isLoadingReport || isLoadingCompany) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-12 w-12 animate-spin text-black" />
      </div>
    );
  }

  if (!report) return <div>Report not found</div>;

  return (
    <div className="min-h-screen bg-white text-black p-8 md:p-12 font-sans max-w-[1000px] mx-auto">
      {/* Print Button - hidden in actual print */}
      <div className="no-print mb-8 flex justify-end">
        <button 
          onClick={() => window.print()}
          className="bg-black text-white px-6 py-2 rounded font-bold uppercase tracking-wider text-sm hover:bg-gray-800"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Header */}
      <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">{company?.name || 'Company Name'}</h1>
          <h2 className="text-xl font-bold text-gray-600 uppercase tracking-widest">Daily Field Report</h2>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{format(new Date(report.reportDate), 'MM/dd/yyyy')}</div>
          <div className="text-sm font-semibold uppercase tracking-wider text-gray-500 mt-1">
            Status: {report.status}
          </div>
        </div>
      </div>

      {/* Basics Grid */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-6 mb-12">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Project</div>
          <div className="font-semibold text-lg">{report.projectName || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Crew</div>
          <div className="font-semibold text-lg">{report.crewName || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Foreman</div>
          <div className="font-semibold text-lg">{report.foremanName || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Location</div>
          <div className="font-semibold text-lg">{report.workLocation || '-'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Hours</div>
          <div className="font-semibold text-lg">
            {report.startTime || '-'} to {report.stopTime || '-'}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 border-b border-gray-200 pb-1">Weather</div>
          <div className="font-semibold text-lg">{report.weatherConditions || '-'}</div>
        </div>
      </div>

      {/* Hours Table */}
      <div className="mb-12">
        <h3 className="text-sm font-bold uppercase tracking-widest text-black bg-gray-100 p-2 mb-4">Labor Hours</h3>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-2">Employee</th>
              <th className="py-2">Trade</th>
              <th className="py-2 text-right">Reg</th>
              <th className="py-2 text-right">OT</th>
              <th className="py-2 text-right">DT</th>
            </tr>
          </thead>
          <tbody>
            {timeEntries.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-gray-500 italic text-center">No hours logged.</td></tr>
            ) : (
              timeEntries.map(entry => (
                <tr key={entry.id} className="border-b border-gray-200">
                  <td className="py-2 font-semibold">{entry.employeeName}</td>
                  <td className="py-2">{entry.trade}</td>
                  <td className="py-2 text-right">{entry.regularHours}</td>
                  <td className="py-2 text-right">{entry.overtimeHours || 0}</td>
                  <td className="py-2 text-right">{entry.doubleTimeHours || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Work Summary */}
      <div className="mb-12">
        <h3 className="text-sm font-bold uppercase tracking-widest text-black bg-gray-100 p-2 mb-4">Work Performed</h3>
        <p className="whitespace-pre-wrap text-base leading-relaxed">
          {report.workPerformed || 'No work description provided.'}
        </p>
      </div>

      {/* Materials / Equipment */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        <div>
           <h3 className="text-sm font-bold uppercase tracking-widest text-black bg-gray-100 p-2 mb-4">Materials</h3>
           <table className="w-full text-left text-sm border-collapse">
             <thead>
               <tr className="border-b border-black">
                 <th className="py-1">Item</th>
                 <th className="py-1 text-right">Qty</th>
                 <th className="py-1 text-right">Unit</th>
               </tr>
             </thead>
             <tbody>
               {materials.length === 0 ? (
                 <tr><td colSpan={3} className="py-2 text-gray-500 italic">None</td></tr>
               ) : materials.map(m => (
                 <tr key={m.id} className="border-b border-gray-200">
                   <td className="py-1">{m.name}</td>
                   <td className="py-1 text-right">{m.quantity}</td>
                   <td className="py-1 text-right">{m.unit}</td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
        <div>
           <h3 className="text-sm font-bold uppercase tracking-widest text-black bg-gray-100 p-2 mb-4">Equipment</h3>
           <table className="w-full text-left text-sm border-collapse">
             <thead>
               <tr className="border-b border-black">
                 <th className="py-1">Equipment</th>
                 <th className="py-1">Unit ID</th>
                 <th className="py-1 text-right">Hours</th>
               </tr>
             </thead>
             <tbody>
               {equipment.length === 0 ? (
                 <tr><td colSpan={3} className="py-2 text-gray-500 italic">None</td></tr>
               ) : equipment.map(e => (
                 <tr key={e.id} className="border-b border-gray-200">
                   <td className="py-1">{e.name}</td>
                   <td className="py-1">{e.unitId || '-'}</td>
                   <td className="py-1 text-right">{e.hoursUsed}</td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      </div>

      {/* Safety & Issues */}
      <div className="mb-12">
        <h3 className="text-sm font-bold uppercase tracking-widest text-black bg-gray-100 p-2 mb-4">Safety & Incidents</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 border-2 border-black flex items-center justify-center ${report.safetyMeeting ? 'bg-black' : 'bg-white'}`}>
              {report.safetyMeeting && <div className="w-2 h-2 bg-white" />}
            </div>
            <span className="font-semibold">Safety Meeting Held</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 border-2 border-black flex items-center justify-center ${report.injuries ? 'bg-black' : 'bg-white'}`}>
              {report.injuries && <div className="w-2 h-2 bg-white" />}
            </div>
            <span className="font-semibold">Injuries Occurred</span>
          </div>
        </div>
        {(report.safetyNotes || report.injuryDetails || report.delays) && (
          <div className="mt-4 p-4 border border-black space-y-2">
            {report.delays && <p><span className="font-bold">Delays:</span> {report.delays}</p>}
            {report.injuryDetails && <p><span className="font-bold">Injury Details:</span> {report.injuryDetails}</p>}
            {report.safetyNotes && <p><span className="font-bold">Safety Notes:</span> {report.safetyNotes}</p>}
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="mt-24 pt-12 border-t border-gray-300">
        <div className="flex justify-between items-end">
          <div className="w-64 border-b-2 border-black pb-2">
             <div className="text-xs uppercase font-bold text-gray-500 mb-8">Foreman Signature</div>
             <div className="font-bold font-serif italic text-2xl px-2">
                {report.status === 'complete' ? report.foremanName : ""}
             </div>
          </div>
          <div className="w-48 border-b-2 border-black pb-2 text-right">
             <div className="text-xs uppercase font-bold text-gray-500 mb-8">Date Signed</div>
             <div className="font-bold">
               {report.status === 'complete' && report.completedAt ? format(new Date(report.completedAt), 'MM/dd/yyyy') : '-'}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
