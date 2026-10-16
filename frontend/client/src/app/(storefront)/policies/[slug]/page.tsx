import { notFound } from "next/navigation";
import { apiSettings } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const PAGES: Record<string, { title: string; intro: string }> = {
  shipping: {
    title: "Shipping Policy",
    intro:
      "How orders are packed, dispatched and delivered, and how shipping charges are calculated.",
  },
  returns: {
    title: "Return & Refund Policy",
    intro: "Eligibility, timelines and the process for returns, exchanges and refunds.",
  },
  privacy: {
    title: "Privacy Policy",
    intro: "What information we collect, why we collect it, and the choices you have.",
  },
  terms: {
    title: "Terms of Service",
    intro: "The agreement between you and Stellora when you use this website.",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: PAGES[slug]?.title ?? "Policy" };
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = PAGES[slug];
  if (!meta) notFound();

  let body = "";
  try {
    const rows = await apiSettings();
    const setting = rows.find((r) => r.key === `policy_${slug}`) ?? null;
    body = setting?.value ?? "";
  } catch {
    body = "";
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-medium">{meta.title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">{meta.intro}</p>
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </div>

      <div className="prose-stellora mt-10 whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
        {body ||
          "This policy is being finalised by the store. If you have a question that would be covered here, please contact our support team and they will help you directly."}
      </div>
    </div>
  );
}
