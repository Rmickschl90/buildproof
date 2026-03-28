import { redirect } from "next/navigation";

export default function Home() {
  // Single entry point:
  // /dashboard should enforce auth and redirect unauthenticated users to /login.
  redirect("/dashboard");
}
