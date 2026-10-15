#!/bin/bash
# Generates Stellora product/banner imagery via z-ai CLI. Resumable: skips existing files.
set -u
OUT="/home/z/my-project/stellora-repo/public/images"
mkdir -p "$OUT/products" "$OUT/banners"

STYLE="professional luxury e-commerce product photography, warm ivory cream background, champagne gold accents, soft diffused studio lighting, minimalist premium aesthetic, high quality, detailed, no text, no watermark"

gen() { # $1 name, $2 size, $3 prompt
  local out="$1"
  if [ -f "$out" ] && [ -s "$out" ]; then echo "skip $(basename $out)"; return 0; fi
  echo "gen $(basename $out) ..."
  z-ai image -p "$3" -o "$out" -s "$2" && echo "done $(basename $out)" || echo "FAILED $(basename $out)"
}

P="$OUT/products"
# Jewellery
gen "$P/aurelia-silver-pendant-necklace.jpg" 1024x1024 "delicate sterling silver teardrop pendant necklace on fine cable chain, laid on warm ivory silk fabric, $STYLE"
gen "$P/celeste-pearl-drop-earrings.jpg" 1024x1024 "pair of white pearl drop earrings with silver hooks, on cream marble surface beside soft shadow, $STYLE"
gen "$P/ivanna-gold-bangle-set.jpg" 1024x1024 "set of four champagne gold bangles with satin brushed texture, stacked on ivory pedestal, $STYLE"
gen "$P/solene-silver-ring.jpg" 1024x1024 "sculptural twisted sterling silver band ring on small cream stand, macro shot, $STYLE"
gen "$P/marisol-choker-set.jpg" 1024x1024 "layered triple chain choker necklace in warm gold tone arranged elegantly on ivory linen, $STYLE"
# Hair
gen "$P/velvet-clip-in-extensions-18.jpg" 1024x1024 "luxurious natural black hair extension bundles tied with silk ribbon, on cream marble with wooden comb, $STYLE"
gen "$P/sera-bun-extension.jpg" 1024x1024 "messy bun hair extension piece in natural black on cream display stand, salon product photography, $STYLE"
gen "$P/luna-front-lace-bangs.jpg" 1024x1024 "feathered fringe hair piece with lace base on minimal cream display, natural black, $STYLE"
# Vanity
gen "$P/rouge-velvet-lipstick.jpg" 1024x1024 "elegant matte lipstick in rosewood shade with gold accent tube, on ivory pedestal with soft petal, $STYLE"
gen "$P/glow-rite-serum.jpg" 1024x1024 "glass serum dropper bottle with amber liquid on cream marble, minimal luxury skincare photography, $STYLE"
gen "$P/lumiere-vanity-mirror.jpg" 1024x1024 "round LED vanity mirror with soft glowing halo light on dressing table, warm cream tones, $STYLE"
gen "$P/blush-atelier-brush-set.jpg" 1024x1024 "set of six makeup brushes with champagne gold ferrules in travel pouch, ivory background, $STYLE"
# Handbags
gen "$P/asta-structured-tote.jpg" 1024x1024 "structured tan leather tote handbag with gold hardware standing on cream studio floor, soft shadow, $STYLE"
gen "$P/petra-sling-bag.jpg" 1024x1024 "quilted black crossbody sling bag with gold chain strap on ivory surface, $STYLE"
gen "$P/noor-evening-clutch.jpg" 1024x1024 "ivory satin evening clutch with pearl clasp on cream silk, soft glow, $STYLE"
gen "$P/wren-cardholder.jpg" 1024x1024 "slim pebbled tan leather card holder wallet on cream marble, minimal composition, $STYLE"

B="$OUT/banners"
gen "$B/hero-main.jpg" 1344x768 "luxury boutique editorial scene, gold jewellery with silk ribbon, perfume bottle and cream handbag on warm ivory draped fabric, champagne gold tones, elegant wide composition, $STYLE"
gen "$B/promo-handbags.jpg" 1344x768 "elegant tan and cream handbags arranged on ivory steps with warm evening light, luxury retail editorial, $STYLE"
gen "$B/category-jewellery.jpg" 1152x864 "sterling silver and gold jewellery collection arranged on ivory velvet, necklaces earrings rings, luxury flat lay, $STYLE"
gen "$B/category-hair.jpg" 1152x864 "sleek dark hair extensions with silk ribbons and wooden brush on cream marble, luxury salon still life, $STYLE"
gen "$B/category-vanity.jpg" 1152x864 "curated beauty vanity flat lay with lipstick serum and gold mirror on ivory background, luxury cosmetics editorial, $STYLE"
gen "$B/category-handbags.jpg" 1152x864 "premium handbag collection in tan ivory and black arranged on cream podiums, luxury retail display, $STYLE"

# Alternate views: mirrored + slight crop via sharp
node -e '
const sharp = require("/home/z/my-project/stellora-repo/node_modules/sharp");
const fs = require("fs");
const path = require("path");
const dir = "/home/z/my-project/stellora-repo/public/images/products";
(async () => {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".jpg") || f.endsWith("-b.jpg")) continue;
    const out = path.join(dir, f.replace(".jpg", "-b.jpg"));
    if (fs.existsSync(out)) continue;
    const img = sharp(path.join(dir, f));
    const meta = await img.metadata();
    await img.flop().extract({ left: Math.round((meta.width||1000)*0.05), top: Math.round((meta.height||1000)*0.05), width: Math.round((meta.width||1000)*0.9), height: Math.round((meta.height||1000)*0.9) }).jpeg({ quality: 82 }).toFile(out);
    console.log("alt view:", f);
  }
})();
'
echo "ALL IMAGES DONE"
