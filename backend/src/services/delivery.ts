import { db } from "../lib/db";

/**
 * Stellora Delivery Partners — courier catalog + store-level configuration.
 *
 * Shop owners pick a default courier (or a custom local one) in
 * Admin → Settings → Delivery partner. Every SHIPPED order stores the
 * partner's display name in `order.shipment.carrier`, and the customer-facing
 * pages build a one-click "Track on courier site" link from the catalog
 * patterns below. `{awb}` in a pattern is replaced with the tracking number.
 *
 * The `delivery.api_key` setting is reserved for auto-sync integrations
 * (Shiprocket/Delhivery APIs) — it is never exposed through the public
 * settings endpoint and only admins can read it.
 */

export type DeliveryPartner = {
  id: string;
  name: string;
  /** Tracking URL pattern containing `{awb}`. null = no online tracking. */
  trackingUrl: string | null;
};

export const DELIVERY_PARTNERS: DeliveryPartner[] = [
  { id: "shiprocket", name: "Shiprocket", trackingUrl: "https://shiprocket.co/tracking/{awb}" },
  { id: "delhivery", name: "Delhivery", trackingUrl: "https://www.delhivery.com/track/{awb}" },
  { id: "bluedart", name: "Blue Dart", trackingUrl: "https://www.bluedart.com/tracking?tracknos={awb}" },
  { id: "dtdc", name: "DTDC", trackingUrl: "https://www.dtdc.in/track.asp?strCnno={awb}" },
  { id: "ekart", name: "Ekart Logistics", trackingUrl: "https://ekartlogistics.com/shipmenttrack/{awb}" },
  { id: "xpressbees", name: "XpressBees", trackingUrl: "https://www.xpressbees.com/shipment-tracking?awbno={awb}" },
  { id: "ecom_express", name: "Ecom Express", trackingUrl: "https://ecomexpress.in/track/?awb_field={awb}" },
  { id: "india_post", name: "India Post", trackingUrl: "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx" },
  { id: "custom", name: "Custom courier", trackingUrl: null },
];

export type DeliveryConfig = {
  enabled: boolean;
  partnerId: string;
  etaDays: number;
  customName: string;
  customTrackingUrl: string;
  apiKey: string;
};

export const DELIVERY_SETTING_KEYS = [
  "delivery.enabled",
  "delivery.partner",
  "delivery.eta_days",
  "delivery.custom_name",
  "delivery.custom_tracking_url",
  "delivery.api_key",
] as const;

const CACHE_TTL_MS = 30_000;
let cache: { at: number; config: DeliveryConfig } | null = null;

/** Invalidate after settings are saved (admin settings PUT). */
export function invalidateDeliveryCache(): void {
  cache = null;
}

/** Load delivery settings with a short cache — safe to call per-request. */
export async function getDeliveryConfig(force = false): Promise<DeliveryConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.config;
  const rows = await db.siteSetting.findMany({
    where: { key: { in: [...DELIVERY_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const config: DeliveryConfig = {
    enabled: (map["delivery.enabled"] ?? "true") === "true",
    partnerId: map["delivery.partner"] || "shiprocket",
    etaDays: Math.max(1, Math.min(30, Number(map["delivery.eta_days"]) || 4)),
    customName: (map["delivery.custom_name"] ?? "").slice(0, 80),
    customTrackingUrl: (map["delivery.custom_tracking_url"] ?? "").slice(0, 300),
    apiKey: map["delivery.api_key"] ?? "",
  };
  cache = { at: Date.now(), config };
  return config;
}

/** The store's default partner (used when an order has no carrier stored). */
export function defaultPartner(config: DeliveryConfig): DeliveryPartner {
  if (config.partnerId === "custom") {
    return {
      id: "custom",
      name: config.customName || "Courier",
      trackingUrl: config.customTrackingUrl || null,
    };
  }
  return DELIVERY_PARTNERS.find((p) => p.id === config.partnerId) ?? DELIVERY_PARTNERS[0];
}

/**
 * Resolve which partner an order shipped with. The order stores the partner's
 * DISPLAY NAME (legacy orders may hold free text like "BlueDart") — match by
 * id, then name, then treat anything else as a custom/local courier.
 */
export function resolvePartner(config: DeliveryConfig, carrier: string | null | undefined): DeliveryPartner {
  const raw = (carrier ?? "").trim();
  if (!raw) return defaultPartner(config);
  const byId = DELIVERY_PARTNERS.find((p) => p.id.toLowerCase() === raw.toLowerCase());
  if (byId) return byId.id === "custom" ? defaultPartner(config) : byId;
  const byName = DELIVERY_PARTNERS.find((p) => p.name.toLowerCase() === raw.toLowerCase());
  if (byName) return byName;
  return { id: "custom", name: raw, trackingUrl: config.customTrackingUrl || null };
}

/** Build the customer-facing tracking link (null when not trackable online). */
export function buildTrackingUrl(partner: DeliveryPartner, trackingNumber: string | null | undefined): string | null {
  if (!trackingNumber) return null;
  if (!partner.trackingUrl) return null;
  return partner.trackingUrl.includes("{awb}")
    ? partner.trackingUrl.replace("{awb}", encodeURIComponent(trackingNumber))
    : partner.trackingUrl;
}

/** ISO date estimate: order/placement date + configured ETA days. */
export function estimateDeliveryIso(etaDays: number, from: Date | string): string {
  const d = new Date(from);
  d.setDate(d.getDate() + Math.max(1, etaDays));
  return d.toISOString();
}
