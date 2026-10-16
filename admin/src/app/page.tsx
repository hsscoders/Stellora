import { redirect } from "next/navigation";

/** /admin-console -> /admin-console/admin */
export default function AdminIndexPage() {
  redirect("/admin");
}
