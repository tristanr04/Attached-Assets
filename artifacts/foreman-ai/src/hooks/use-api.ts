import { useQuery, useMutation } from '@tanstack/react-query';

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useApiQuery<T>(endpoint: string, enabled = true) {
  const url = `${baseUrl}${endpoint}`;
  return useQuery<T>({ 
    queryKey: [url], 
    queryFn: () => fetch(url).then(r => {
      if (!r.ok) throw new Error("Network response was not ok");
      return r.json();
    }), 
    enabled 
  });
}

export function useApiMutation<TBody, TResult>(method: 'POST'|'PATCH'|'DELETE'|'PUT', endpoint: string) {
  return useMutation<TResult, Error, { endpoint?: string; body?: TBody }>({
    mutationFn: ({ endpoint: overrideEndpoint, body }) => {
      const url = `${baseUrl}${overrideEndpoint ?? endpoint}`;
      return fetch(url, {
        method, 
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }).then(r => {
        if (!r.ok) throw new Error("Network response was not ok");
        // Handle no content (e.g., DELETE)
        if (r.status === 204 || r.headers.get("content-length") === "0") {
          return {} as TResult;
        }
        return r.json();
      });
    },
  });
}
