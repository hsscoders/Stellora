import { handle, ok } from "@/lib/http";
import { getActiveShippingRate } from "@/lib/services/pricing";
import { money } from "@/lib/money";

export async function GET() {
  return handle(async () => {
    const rate = await getActiveShippingRate();
    if (!rate) return ok(null);
    return ok({
      name: rate.name,
      baseFee: money(rate.baseFee),
      freeAbove: rate.freeAbove ? money(rate.freeAbove) : null,
    });
  });
}
