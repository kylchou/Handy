import { redirect } from "next/navigation";

export default function RootPage() {
  // Per the product spec, the home screen IS the "what can we help you
  // with" chat entry point - there's no separate landing page to route
  // through. Auth gating happens in the chat page / a shared layout
  // once real auth exists.
  redirect("/chat");
}
