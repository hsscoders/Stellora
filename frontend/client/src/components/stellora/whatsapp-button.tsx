import { MessageCircle } from "lucide-react";

/**
 * Floating WhatsApp contact button. Renders only when a WhatsApp number is
 * configured in store settings (admin → Settings → whatsapp_number).
 */
export function WhatsAppButton({ phone }: { phone: string | null }) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(
        "Hi Stellora! I have a question about a product."
      )}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-20 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition-transform duration-300 hover:scale-105"
    >
      <MessageCircle className="h-6 w-6" fill="currentColor" aria-hidden />
    </a>
  );
}
