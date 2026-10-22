"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Plus, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { formatDate } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [open, setOpen] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");

  const load = () =>
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => j.ok && setCurrentEmail(j.data.user?.email ?? ""));
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success("Admin user created");
      setOpen(false);
      load();
    } else {
      toast.error(json.error?.message ?? "Could not create user");
    }
  }

  async function setActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(isActive ? "Activated" : "Deactivated");
      load();
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      admins: list.filter((u) => u.role === "ADMIN").length,
      staff: list.filter((u) => u.role !== "ADMIN").length,
      active: list.filter((u) => u.isActive).length,
    };
  }, [rows]);

  const columns: Column<AdminUser>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        sortValue: (u) => u.name,
        searchValue: (u) => `${u.name} ${u.email}`,
        cell: (u) => <span className="block max-w-56 truncate font-medium">{u.name}</span>,
      },
      {
        key: "email",
        header: "Email",
        sortValue: (u) => u.email,
        searchValue: (u) => u.email,
        hideBelow: "sm",
        cell: (u) => <span className="block max-w-64 truncate text-sm text-muted-foreground">{u.email}</span>,
      },
      {
        key: "role",
        header: "Role",
        sortValue: (u) => u.role,
        searchValue: (u) => u.role,
        cell: (u) => (
          <Badge variant="secondary" className="gap-1">
            {u.role === "ADMIN" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {u.role}
          </Badge>
        ),
      },
      {
        key: "joined",
        header: "Joined",
        sortValue: (u) => new Date(u.createdAt).getTime(),
        hideBelow: "md",
        cell: (u) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(u.createdAt)}</span>,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (u) => (u.isActive ? 1 : 0),
        searchValue: (u) => (u.isActive ? "active" : "deactivated"),
        cell: (u) => (
          <Badge
            variant="secondary"
            className={
              u.isActive
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
            }
          >
            {u.isActive ? "Active" : "Deactivated"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        cell: (u) =>
          u.email !== currentEmail ? (
            <Button variant="outline" size="sm" onClick={() => setActive(u.id, !u.isActive)}>
              {u.isActive ? "Deactivate" : "Activate"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">You</span>
          ),
      },
    ],
    [currentEmail]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Admin Users"
        subtitle="People with panel access. Least privilege applies: only promote people who need it."
        actions={
          <Button className="rounded-full bg-primary hover:bg-primary/90" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New admin
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Admin accounts" value={stats.total} icon={Users} />
        <StatCard label="Panel admins" value={stats.admins} icon={ShieldCheck} accent="text-emerald-600" />
        <StatCard label="Storefront only" value={stats.staff} icon={ShieldAlert} accent="text-amber-600" />
        <StatCard label="Active" value={stats.active} icon={Activity} accent="text-sky-600" />
      </div>

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(u) => u.id}
        searchable
        searchPlaceholder="Search name, email or role…"
        initialSort={{ key: "name", dir: "asc" }}
        csvName="admin-users"
        printTitle="Admin users"
        emptyMessage="No admin users yet."
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admin user</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label htmlFor="uname">Name *</Label>
              <Input id="uname" name="name" required minLength={2} />
            </div>
            <div>
              <Label htmlFor="uemail">Email *</Label>
              <Input id="uemail" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="upassword">Temporary password *</Label>
              <Input id="upassword" name="password" type="password" required minLength={8} />
              <p className="mt-1 text-xs text-muted-foreground">
                At least 8 characters with a letter and a number. Share it securely and ask them to
                change it after first sign-in.
              </p>
            </div>
            <div>
              <Label htmlFor="urole">Role *</Label>
              <select
                id="urole"
                name="role"
                defaultValue="ADMIN"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="ADMIN">ADMIN — full panel access</option>
                <option value="CUSTOMER">CUSTOMER — storefront only</option>
              </select>
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Create user
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
