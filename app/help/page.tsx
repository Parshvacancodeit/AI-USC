import { redirect } from "next/navigation";

// Help SC is now two tabs: /ask and /favors.
export default function HelpPage() {
  redirect("/ask");
}
