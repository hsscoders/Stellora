"use client";

import { useEffect, useState } from "react";
import { Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-medium">Admin Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People with panel access. Least privilege applies: only promote people who need it.
          </p>
        </div>
        <Button className="rounded-full bg-primary hover:bg-primary/90" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New admin
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1">
                    {u.role === "ADMIN" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="text-right">
                  {u.email !== currentEmail && (
                    <Button variant="outline" size="sm" onClick={() => setActive(u.id, !u.isActive)}>
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
