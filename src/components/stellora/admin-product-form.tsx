"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/utils";

interface VariantForm {
  id?: string;
  name: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
}

export interface ProductFormValues {
  name: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  materials: string;
  careInstructions: string;
  status: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  images: { url: string; alt?: string; sortOrder?: number }[];
  variants: VariantForm[];
}

export function ProductForm({
  productId,
  initial,
}: {
  productId?: string;
  initial?: ProductFormValues;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [values, setValues] = useState<ProductFormValues>(
    initial ?? {
      name: "",
      slug: "",
      categoryId: "",
      shortDescription: "",
      description: "",
      materials: "",
      careInstructions: "",
      status: "ACTIVE",
      isFeatured: false,
      isNewArrival: false,
      isBestSeller: false,
      images: [],
      variants: [{ name: "", sku: "", price: "", compareAtPrice: "", stock: "0", lowStockThreshold: "5", isActive: true }],
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((j) => j.ok && setCategories(j.data));
  }, []);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
    const json = await res.json();
    setUploading(false);
    if (json.ok) {
      set("images", [...values.images, { url: json.data.url }]);
      toast.success("Image uploaded");
    } else {
      toast.error(json.error?.message ?? "Upload failed");
    }
  }

  function addImageUrl() {
    const url = window.prompt("Image URL or path (e.g. /images/products/myslug.jpg)");
    if (url) set("images", [...values.images, { url }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      ...values,
      slug: values.slug || slugify(values.name),
      variants: values.variants.map((v) => ({
        ...v,
        id: v.id || undefined,
        price: Number(v.price),
        compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
        stock: Number(v.stock),
        lowStockThreshold: Number(v.lowStockThreshold),
      })),
    };
    const res = await fetch(
      productId ? `/api/admin/products/${productId}` : "/api/admin/products",
      {
        method: productId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success(productId ? "Product updated" : "Product created");
      router.push("/admin/products");
      router.refresh();
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save product");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-border/70 bg-card p-6">
          <h2 className="font-serif text-lg font-medium">Basics</h2>
          <div>
            <Label htmlFor="name">Product name *</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={140}
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="slug">Slug (auto from name if empty)</Label>
            <Input
              id="slug"
              value={values.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="aurelia-necklace"
            />
          </div>
          <div>
            <Label>Category *</Label>
            <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && <p className="mt-1 text-xs text-destructive">{errors.categoryId}</p>}
          </div>
          <div>
            <Label htmlFor="shortDescription">Short description *</Label>
            <Textarea
              id="shortDescription"
              value={values.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              rows={2}
              required
              maxLength={300}
            />
            {errors.shortDescription && (
              <p className="mt-1 text-xs text-destructive">{errors.shortDescription}</p>
            )}
          </div>
          <div>
            <Label htmlFor="description">Full description</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
            />
          </div>
          <div>
            <Label htmlFor="materials">Materials</Label>
            <Textarea
              id="materials"
              value={values.materials}
              onChange={(e) => set("materials", e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="care">Care instructions</Label>
            <Textarea
              id="care"
              value={values.careInstructions}
              onChange={(e) => set("careInstructions", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-lg font-medium">Status &amp; badges</h2>
            <div>
              <Label>Status</Label>
              <Select value={values.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active (visible in shop)</SelectItem>
                  <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[
              { key: "isFeatured" as const, label: "Featured (homepage Featured Selections)" },
              { key: "isNewArrival" as const, label: "New arrival (prioritised in New Arrivals)" },
              { key: "isBestSeller" as const, label: "Best seller (Best Sellers section)" },
            ].map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <Checkbox
                  id={b.key}
                  checked={values[b.key]}
                  onCheckedChange={(v) => set(b.key, Boolean(v))}
                />
                <Label htmlFor={b.key} className="text-sm font-normal">
                  {b.label}
                </Label>
              </div>
            ))}
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-lg font-medium">Images</h2>
            <div className="grid grid-cols-3 gap-3">
              {values.images.map((img, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => set("images", values.images.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addImageUrl}>
                <Plus className="h-4 w-4" /> By URL
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WebP, up to 5 MB. First image is used as the primary photo.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-medium">Variants</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set("variants", [
                    ...values.variants,
                    { name: "", sku: "", price: "", compareAtPrice: "", stock: "0", lowStockThreshold: "5", isActive: true },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add variant
              </Button>
            </div>
            {errors.variants && <p className="text-xs text-destructive">{errors.variants}</p>}
            <div className="space-y-4">
              {values.variants.map((v, i) => (
                <div key={i} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Variant {i + 1}</p>
                    {values.variants.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove variant"
                        onClick={() => set("variants", values.variants.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Name (e.g. Size 7 / Tan)</Label>
                      <Input
                        value={v.name}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, name: e.target.value };
                          set("variants", arr);
                        }}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">SKU (unique)</Label>
                      <Input
                        value={v.sku}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, sku: e.target.value.toUpperCase() };
                          set("variants", arr);
                        }}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Price (₹) *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={v.price}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, price: e.target.value };
                          set("variants", arr);
                        }}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Compare-at price (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={v.compareAtPrice}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, compareAtPrice: e.target.value };
                          set("variants", arr);
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Stock *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={v.stock}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, stock: e.target.value };
                          set("variants", arr);
                        }}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Low-stock alert at</Label>
                      <Input
                        type="number"
                        min="0"
                        value={v.lowStockThreshold}
                        onChange={(e) => {
                          const arr = [...values.variants];
                          arr[i] = { ...v, lowStockThreshold: e.target.value };
                          set("variants", arr);
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Switch
                      checked={v.isActive}
                      onCheckedChange={(checked) => {
                        const arr = [...values.variants];
                        arr[i] = { ...v, isActive: checked };
                        set("variants", arr);
                      }}
                      id={`vactive-${i}`}
                    />
                    <Label htmlFor={`vactive-${i}`} className="text-xs font-normal">
                      Active / purchasable
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary px-8 hover:bg-primary/90"
        >
          {busy ? "Saving…" : productId ? "Save changes" : "Create product"}
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
