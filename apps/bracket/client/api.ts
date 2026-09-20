import { queryOptions } from "@tanstack/react-query";
import type { brackets, versions, runs } from "../server/db/schema";
import type { User } from "../server/auth";
export type Bracket = typeof brackets.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Template = { bracket: Bracket; version: Version };
export type SavedRun = { run: Run; version: Version };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(body.error ?? "Request failed. Please try again.", response.status);
  return body as T;
}
export const meOptions = queryOptions({
  queryKey: ["me"],
  queryFn: () => api<{ user: User | null; accountURL: string }>("/api/me"),
  staleTime: 60_000,
});
export const dashboardOptions = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => api<{ brackets: Template[]; runs: SavedRun[] }>("/api/dashboard"),
});
export const sharedOptions = (shareID: string) =>
  queryOptions({
    queryKey: ["shared", shareID],
    queryFn: () => api<{ shareID: string; version: Version }>(`/api/shared/${shareID}`),
  });
export const templateOptions = (id: string) =>
  queryOptions({ queryKey: ["template", id], queryFn: () => api<Template>(`/api/brackets/${id}`) });
export const runOptions = (id: string) =>
  queryOptions({ queryKey: ["run", id], queryFn: () => api<SavedRun>(`/api/runs/${id}`) });
export function loginURL(returnTo = location.pathname) {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
