import { Schema, model } from "mongoose";

/* ---------- Session (DB-backed auth sessions) ---------- */

const SessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "sessions" }
);

SessionSchema.index({ userId: 1 });

export const Session = model("Session", SessionSchema);

/* ---------- PasswordResetToken ---------- */

const PasswordResetTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "passwordresettokens" }
);

PasswordResetTokenSchema.index({ userId: 1 });

export const PasswordResetToken = model("PasswordResetToken", PasswordResetTokenSchema);

/* ---------- HomepageBanner ---------- */

const HomepageBannerSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: null },
    imageUrl: { type: String, required: true },
    ctaLabel: { type: String, default: null },
    ctaHref: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "homepagebanners" }
);

export const HomepageBanner = model("HomepageBanner", HomepageBannerSchema);

/* ---------- SiteSetting (key-value) ---------- */

const SiteSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
  },
  { timestamps: true, collection: "sitesettings" }
);

export const SiteSetting = model("SiteSetting", SiteSettingSchema);

/* ---------- ContactMessage ---------- */

const ContactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["NEW", "HANDLED"], default: "NEW" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "contactmessages" }
);

export const ContactMessage = model("ContactMessage", ContactMessageSchema);

/* ---------- AuditLog ---------- */

const AuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "auditlogs" }
);

AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = model("AuditLog", AuditLogSchema);

/* ---------- WebhookEvent (payment gateway webhooks, future) ---------- */

const WebhookEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true, unique: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, default: "RECEIVED" },
    processedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "webhookevents" }
);

export const WebhookEvent = model("WebhookEvent", WebhookEventSchema);

/* ---------- CashSession (POS cash register — Stocky-style open/close) ---------- */

const CashSessionSchema = new Schema(
  {
    terminalId: { type: String, required: true, trim: true, maxlength: 16 },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
    openedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    openedByName: { type: String, default: null },
    openingBalance: { type: Number, default: 0, min: 0 },
    openingNote: { type: String, default: null, maxlength: 300 },
    countedBalance: { type: Number, default: null, min: 0 },
    expectedCash: { type: Number, default: null, min: 0 },
    cashSales: { type: Number, default: null, min: 0 },
    variance: { type: Number, default: null },
    closingNote: { type: String, default: null, maxlength: 300 },
    openedAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "cashsessions" }
);

CashSessionSchema.index({ terminalId: 1, status: 1 });
CashSessionSchema.index({ openedAt: -1 });

export const CashSession = model("CashSession", CashSessionSchema);
