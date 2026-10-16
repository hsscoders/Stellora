// Fictional product catalogue data (from the original Stellora seed) — development only.
export type SeedProduct = {
  slug: string;
  cat: string;
  name: string;
  short: string;
  desc: string;
  materials?: string;
  care?: string;
  featured?: boolean;
  best?: boolean;
  fresh?: boolean;
  variants: { name: string; sku: string; price: number; compareAt?: number; stock: number }[];
};

export const products: SeedProduct[] = [
    // ---- Jewellery ----
    {
      slug: "aurelia-silver-pendant-necklace",

      cat: "jewellery",
      name: "Aurelia Silver Pendant Necklace",
      short: "A delicate 92.5 sterling silver pendant on a fine cable chain, made for daily layering.",
      desc: "The Aurelia pendant pairs a hand-polished teardrop charm with a whisper-light cable chain. Rhodium plating resists tarnish, and the spring-ring clasp sits flat against the collarbone. Wear it alone for quiet elegance or layered with longer chains.",
      materials: "92.5 sterling silver, rhodium plated. Nickel free.",
      care: "Wipe with a soft cloth after wear. Keep away from perfume and water. Store in the pouch provided.",
      featured: true,
      fresh: true,
      variants: [
        { name: '16" Chain', sku: "JWL-AUR-P16", price: 1499, compareAt: 1899, stock: 24 },
        { name: '18" Chain', sku: "JWL-AUR-P18", price: 1599, compareAt: 1999, stock: 18 },
      ],
    },
    {
      slug: "celeste-pearl-drop-earrings",
      cat: "jewellery",
      name: "Celeste Pearl Drop Earrings",
      short: "Freshwater-style pearl drops suspended from sterling silver hooks.",
      desc: "Celeste catches light with every turn — a single luminous pearl drop hung from a slender silver hook. Featherlight for all-day wear, from boardroom to banquet.",
      materials: "Shell pearl, 92.5 sterling silver hooks.",
      care: "Store flat in the box. Avoid contact with cosmetics.",
      featured: true,
      best: true,
      variants: [{ name: "One Size", sku: "JWL-CEL-E01", price: 899, compareAt: 1199, stock: 40 }],
    },
    {
      slug: "ivanna-gold-bangle-set",
      cat: "jewellery",
      name: "Ivanna Gold Bangle Set",
      short: "A set of four textured bangles in a warm champagne-gold finish.",
      desc: "Ivanna stacks four molten-gold tones with a satin-brushed texture that reads luxury at every angle. Hinged edges keep the set comfortably snug through long evenings.",
      materials: "Brass base, 18k champagne-gold plating.",
      care: "Remove before washing hands. Buff gently with the jewellery cloth.",
      fresh: true,
      variants: [
        { name: "2.4 Diameter", sku: "JWL-IVN-B24", price: 1299, stock: 30 },
        { name: "2.6 Diameter", sku: "JWL-IVN-B26", price: 1299, stock: 26 },
      ],
    },
    {
      slug: "solene-silver-ring",
      cat: "jewellery",
      name: "Solène Twisted Silver Ring",
      short: "A sculptural twisted band in polished sterling silver.",
      desc: "Solène's intertwined form catches light along every ridge. A quiet statement on its own, or the anchor of a stacked set.",
      materials: "92.5 sterling silver.",
      care: "Polish with a silver cloth; store airtight when not in use.",
      variants: [
        { name: "Size 6", sku: "JWL-SOL-R06", price: 999, stock: 15 },
        { name: "Size 7", sku: "JWL-SOL-R07", price: 999, stock: 20 },
        { name: "Size 8", sku: "JWL-SOL-R08", price: 999, stock: 12 },
      ],
    },
    {
      slug: "marisol-choker-set",
      cat: "jewellery",
      name: "Marisol Layered Choker Set",
      short: "Three graduated chains in one clasp — an instant layered look.",
      desc: "Marisol does the layering for you: three graduating chains united at a single clasp so the set never tangles. Champagne-gold finish warms every neckline.",
      materials: "Brass base, gold-tone plating.",
      care: "Keep dry; wipe after wear.",
      best: true,
      variants: [{ name: "One Size", sku: "JWL-MAR-C01", price: 1199, compareAt: 1599, stock: 22 }],
    },
    // ---- Hair Extensions ----
    {
      slug: "velvet-clip-in-extensions-18",
      cat: "hair-extensions",
      name: "Velvet Clip-In Extensions — 18 inch",
      short: "Seven-piece clip-in set with a soft, natural fall and secure grip.",
      desc: "Velvet's seven-piece set adds length and body in minutes. Double-wefted for fullness with a soft matte fiber that blends with natural texture. Silicone-backed clips grip firmly without pulling.",
      materials: "Heat-resistant synthetic fiber (up to 160°C).",
      care: "Detangle before and after wear. Wash every 8–10 wears with cool water. Air dry flat.",
      featured: true,
      best: true,
      variants: [
        { name: "Natural Black", sku: "HAI-VEL-18-BLK", price: 1899, compareAt: 2399, stock: 25 },
        { name: "Dark Brown", sku: "HAI-VEL-18-BRN", price: 1899, compareAt: 2399, stock: 21 },
      ],
    },
    {
      slug: "sera-bun-extension",
      cat: "hair-extensions",
      name: "Séra Messy Bun Extension",
      short: "An instantly polished updo with an elastic drawstring fit.",
      desc: "Séra wraps into a soft, tousled bun with a drawstring that adjusts to your base. The piece holds shape through long days and dances alike.",
      materials: "Heat-resistant synthetic fiber.",
      care: "Store on the stand provided; refresh with a light mist.",
      fresh: true,
      variants: [
        { name: "Natural Black", sku: "HAI-SER-BUN-BLK", price: 999, stock: 18 },
        { name: "Medium Brown", sku: "HAI-SER-BUN-BRN", price: 999, stock: 15 },
      ],
    },
    {
      slug: "luna-front-lace-bangs",
      cat: "hair-extensions",
      name: "Luna Front Lace Bangs",
      short: "A feathered fringe piece that clips in for an instant change.",
      desc: "Luna's lace base melts into the hairline for a fringe that looks grown, not clipped. Trim to taste and clip out at night.",
      materials: "Synthetic fiber with lace base.",
      care: "Trim carefully with sharp scissors. Keep away from high heat.",
      variants: [{ name: "Natural Black", sku: "HAI-LUN-BNG-BLK", price: 749, stock: 30 }],
    },
    // ---- Vanity ----
    {
      slug: "rouge-velvet-lipstick",
      cat: "vanity",
      name: "Rouge Velvet Lipstick",
      short: "A weightless matte with a blurred velvet finish and eight-hour wear.",
      desc: "Rouge glides on as a cream and sets to a soft matte that never cracks. Pigment-saturated in one stroke, with a comfortable blend of oils that keeps lips cushioned all day.",
      materials: "Paraben-free formula.",
      care: "Store away from direct sunlight.",
      featured: true,
      best: true,
      variants: [
        { name: "Rosewood 02", sku: "VAN-ROU-L02", price: 649, stock: 35 },
        { name: "Classic Red 05", sku: "VAN-ROU-L05", price: 649, stock: 28 },
        { name: "Nude Taupe 09", sku: "VAN-ROU-L09", price: 649, stock: 31 },
      ],
    },
    {
      slug: "glow-rite-serum",
      cat: "vanity",
      name: "Glow-Rite Vitamin C Serum",
      short: "A brightening daily serum with a lightweight, fast-absorbing finish.",
      desc: "Glow-Rite layers a stabilized vitamin C blend with hydrating glycerin for a lit-from-within look. One dropper each morning, before moisturizer.",
      materials: "30 ml. Dermatologically tested formula.",
      care: "Use within 6 months of opening. Store cool and dark.",
      fresh: true,
      variants: [{ name: "30 ml", sku: "VAN-GLW-S30", price: 899, compareAt: 1099, stock: 26 }],
    },
    {
      slug: "lumiere-vanity-mirror",
      cat: "vanity",
      name: "Lumière LED Vanity Mirror",
      short: "A dual-sided mirror with soft LED halo and touch dimming.",
      desc: "Lumière flatters every skin tone with a diffused LED halo. Flip to the 5× magnification for detail work, and dim with a fingertip for evening light.",
      materials: "Glass, brushed metal frame. USB rechargeable.",
      care: "Clean glass with a microfiber cloth.",
      variants: [{ name: "One Size", sku: "VAN-LUM-M01", price: 1699, compareAt: 2199, stock: 14 }],
    },
    {
      slug: "blush-atelier-brush-set",
      cat: "vanity",
      name: "Blush Atelier Brush Set",
      short: "Six vegan brushes with champagne-gold ferrules and a travel pouch.",
      desc: "Blush Atelier pairs silky vegan bristles with weighted gold-tone ferrules for balance and control. The pouch doubles as a stand.",
      materials: "Synthetic (vegan) bristles.",
      care: "Wash with gentle soap; dry flat.",
      best: true,
      variants: [{ name: "6-Piece Set", sku: "VAN-BLS-B06", price: 1149, stock: 20 }],
    },
    // ---- Handbags ----
    {
      slug: "asta-structured-tote",
      cat: "handbags",
      name: "Asta Structured Tote",
      short: "A clean-lined tote with a laptop sleeve and magnetic close.",
      desc: "Asta holds its sculpted shape from commute to meeting. Interior sleeves fit a 13-inch laptop; the magnetic top sits flush. A detachable strap converts it to shoulder carry.",
      materials: "Vegan leather, gold-tone hardware, fabric lining.",
      care: "Wipe with a dry cloth; stuff with paper when storing.",
      featured: true,
      best: true,
      variants: [
        { name: "Tan", sku: "BAG-AST-TOT-TAN", price: 2499, compareAt: 2999, stock: 12 },
        { name: "Ivory", sku: "BAG-AST-TOT-IVR", price: 2499, compareAt: 2999, stock: 9 },
      ],
    },
    {
      slug: "petra-sling-bag",
      cat: "handbags",
      name: "Petra Quilted Sling",
      short: "A quilted crossbody with a chain-and-leather strap.",
      desc: "Petra's diamond quilting and mixed chain strap dress up the smallest silhouette. Fits a phone, cardholder and keys — nothing more, perfectly.",
      materials: "Vegan leather, chain strap.",
      care: "Keep away from liquids and perfume.",
      fresh: true,
      variants: [
        { name: "Black", sku: "BAG-PET-SLG-BLK", price: 1599, stock: 16 },
        { name: "Champagne", sku: "BAG-PET-SLG-CHP", price: 1599, stock: 11 },
      ],
    },
    {
      slug: "noor-evening-clutch",
      cat: "handbags",
      name: "Noor Evening Clutch",
      short: "A satin clutch with a pearl clasp for celebrations.",
      desc: "Noor folds around evenings out — satin faced, pearl clasped, chain tucked inside. Slim enough to hold lightly, pretty enough to be the accessory.",
      materials: "Satin finish, pearl-effect clasp.",
      care: "Store flat in the dust bag.",
      variants: [{ name: "Ivory", sku: "BAG-NOO-CLT-IVR", price: 1299, stock: 14 }],
    },
    {
      slug: "wren-cardholder",
      cat: "handbags",
      name: "Wren Card Holder",
      short: "A slim six-slot card holder in pebbled vegan leather.",
      desc: "Wren slips into the smallest bag with six card slots and a center pocket for folded notes. Edges are hand-painted for a clean finish.",
      materials: "Pebbled vegan leather.",
      care: "Wipe clean with a soft, dry cloth.",
      variants: [
        { name: "Black", sku: "BAG-WRE-CRD-BLK", price: 699, stock: 40 },
        { name: "Tan", sku: "BAG-WRE-CRD-TAN", price: 699, stock: 35 },
      ],
    },
  ];
