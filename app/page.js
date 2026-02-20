import { redirect } from "next/navigation";

export default function Page() {
  // The actual tool lives as a static file in /public/index.html
  redirect("/index.html");
}
