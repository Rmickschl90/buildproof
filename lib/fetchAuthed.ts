import { supabaseBrowser } from "./supabaseBrowser";

export async function fetchAuthed(input: RequestInfo, init: RequestInit = {}) {
  const { data, error } = await supabaseBrowser.auth.getSession();
  const token = data?.session?.access_token;

  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
