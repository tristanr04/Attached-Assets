import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyStore } from "@/hooks/use-company-store";

const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

async function pkbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export function usePkbList<T>(entity: string, companyId: number | undefined) {
  return useQuery<T[]>({
    queryKey: ["pkb", entity, companyId],
    queryFn: () => pkbFetch<T[]>(`/api/pkb/${entity}?companyId=${companyId}`),
    enabled: !!companyId,
  });
}

export function usePkbCreate<T>(entity: string) {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompanyStore();
  return useMutation<T, Error, Partial<T>>({
    mutationFn: (body) =>
      pkbFetch<T>(`/api/pkb/${entity}`, {
        method: "POST",
        body: JSON.stringify({ ...body, companyId: activeCompanyId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pkb", entity] }),
  });
}

export function usePkbUpdate<T>(entity: string) {
  const qc = useQueryClient();
  return useMutation<T, Error, { id: number; data: Partial<T> }>({
    mutationFn: ({ id, data }) =>
      pkbFetch<T>(`/api/pkb/${entity}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pkb", entity] }),
  });
}

export function usePkbDelete(entity: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      pkbFetch<void>(`/api/pkb/${entity}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pkb", entity] }),
  });
}

export function usePkbActivate(entity: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      pkbFetch<void>(`/api/pkb/${entity}/${id}/activate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pkb", entity] }),
  });
}

export function usePkbDuplicate<T>(entity: string) {
  const qc = useQueryClient();
  return useMutation<T, Error, number>({
    mutationFn: (id) =>
      pkbFetch<T>(`/api/pkb/${entity}/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pkb", entity] }),
  });
}
