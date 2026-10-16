"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () =>
    fetch("/api/account/addresses")
      .then((r) => r.json())
      .then((j) => setAddresses(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const form = new FormData(e.currentTarget);
    const payload = { ...Object.fromEntries(form.entries()), isDefault: form.get("isDefault") === "on" };
    const res = await fetch(
      editing ? `/api/account/addresses/${editing.id}` : "/api/account/addresses",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (json.ok) {
      toast.success(editing ? "Address updated" : "Address added");
      setOpen(false);
      setEditing(null);
      load();
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save address");
    }
  }

  async function setDefault(id: string) {
    const a = addresses?.find((x) => x.id === id);
    if (!a) return;
    const res = await fetch(`/api/account/addresses/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...a, isDefault: true }),
    });
    if (res.ok) {
      toast.success("Default address updated");
      load();
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Address removed");
      load();
    } else {
      toast.error("Could not remove address");
    }
  }

  if (!addresses) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Addresses</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="rounded-full bg-primary hover:bg-primary/90" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> Add address
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit address" : "Add address"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" name="fullName" defaultValue={editing?.fullName} required />
                {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone} required />
                {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
              </div>
              <div>
                <Label htmlFor="line1">Address line 1</Label>
                <Input id="line1" name="line1" defaultValue={editing?.line1} required />
                {errors.line1 && <p className="mt-1 text-xs text-destructive">{errors.line1}</p>}
              </div>
              <div>
                <Label htmlFor="line2">Address line 2 (optional)</Label>
                <Input id="line2" name="line2" defaultValue={editing?.line2 ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" defaultValue={editing?.city} required />
                  {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input id="pincode" name="pincode" defaultValue={editing?.pincode} required inputMode="numeric" />
                  {errors.pincode && <p className="mt-1 text-xs text-destructive">{errors.pincode}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" defaultValue={editing?.state} required />
                {errors.state && <p className="mt-1 text-xs text-destructive">{errors.state}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isDefault" name="isDefault" defaultChecked={editing?.isDefault ?? false} />
                <Label htmlFor="isDefault" className="text-sm font-normal">
                  Set as default
                </Label>
              </div>
              <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
                Save address
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No saved addresses yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id} className={a.isDefault ? "border-primary/50" : undefined}>
              <CardContent className="p-5 text-sm">
                <div className="flex items-start justify-between">
                  <p className="font-medium">
                    {a.fullName}
                    {a.isDefault && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                        <Star className="mr-1 h-2.5 w-2.5" /> Default
                      </span>
                    )}
                  </p>
                  <div className="flex gap-1">
                    <button
                      aria-label="Edit address"
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditing(a);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Delete address"
                      className="p-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-muted-foreground">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {a.city}, {a.state} — {a.pincode}
                </p>
                <p className="mt-1 tnum text-muted-foreground">{a.phone}</p>
                {!a.isDefault && (
                  <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-primary" onClick={() => setDefault(a.id)}>
                    Set as default
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
