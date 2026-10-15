import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata = { title: "FAQ" };

const FAQS = [
  {
    q: "How do I place an order?",
    a: "Browse the collections, choose your options, and add pieces to your cart. When you are ready, sign in and check out — you will pick a delivery address and confirm your order in a few taps.",
  },
  {
    q: "How can I pay for my order?",
    a: "Orders are currently confirmed with our team, who will contact you after you place the order to complete payment securely. Online payment will be available at checkout as soon as the store's payment provider is connected.",
  },
  {
    q: "How do I track my order?",
    a: "Use the Track Order page with your order number and the email you used at checkout. You will see the live status of your order as it moves from confirmation to dispatch and delivery.",
  },
  {
    q: "Are the jewellery pieces real sterling silver?",
    a: "Products in the jewellery collection clearly state their materials — 92.5 sterling silver pieces are marked as such, while artificial jewellery lists its finish and base materials on the product page.",
  },
  {
    q: "How do I care for silver jewellery?",
    a: "Wipe pieces with a soft cloth after wear, keep them away from perfume and water, and store them in the pouch provided. Each product page includes specific care instructions.",
  },
  {
    q: "Can I return or exchange a product?",
    a: "Returns and exchanges are accepted under our return policy. Please read the policy page for eligibility and the process to follow, or contact our support team with your order number.",
  },
  {
    q: "Do hair extensions work on short hair?",
    a: "Clip-in sets blend best when your natural hair reaches roughly ear length or longer. If you are unsure, send us a photo via the contact page and we will happily advise.",
  },
  {
    q: "How will I know if something is back in stock?",
    a: "Sold-out options are shown on product pages. When a piece is restocked it appears again with availability, and new arrivals are announced on the homepage.",
  },
];

export default function FAQPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-medium">Frequently Asked Questions</h1>
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </div>
      <Accordion type="single" collapsible className="mt-10">
        {FAQS.map((f, i) => (
          <AccordionItem key={i} value={`q${i}`}>
            <AccordionTrigger className="text-left font-serif text-lg font-medium">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
