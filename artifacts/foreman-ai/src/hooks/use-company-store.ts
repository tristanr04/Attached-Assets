import { create } from 'zustand';

interface CompanyState {
  activeCompanyId: number | null;
  setActiveCompanyId: (id: number | null) => void;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  activeCompanyId: null,
  setActiveCompanyId: (id) => set({ activeCompanyId: id }),
}));
