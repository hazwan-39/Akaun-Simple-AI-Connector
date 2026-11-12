/**
 * Product-wide constants. Changing any of these affects workbook ownership
 * detection, so treat them as a versioned contract.
 */
export const PRODUCT_NAME = "Akaun Simple AI";
export const PRODUCT_SUBTITLE = "Financial Intelligence for Excel";
export const CONNECTOR_ID = "akaun-simple-ai-connector";

export const CASH_FLOW_SKILL_ID = "CASH_FLOW_001" as const;
export const CASH_FLOW_SKILL_VERSION = "1.0.0" as const;

/** Connector-owned worksheet names. These are the ONLY sheets the add-in may write to. */
export const AI_DASHBOARD_SHEET = "AI Cash Flow";
export const AI_DATA_SHEET = "_AI_CF_DATA";
export const CONNECTOR_OWNED_SHEETS = [AI_DASHBOARD_SHEET, AI_DATA_SHEET] as const;

/** Worksheet custom-property key + value used to prove connector ownership. */
export const OWNERSHIP_PROPERTY_KEY = "AkaunSimpleAI_Owner";
export type OwnedSheetRole = "dashboard" | "data";
export const ownershipToken = (sheetRole: OwnedSheetRole) =>
  `${CONNECTOR_ID}:${CASH_FLOW_SKILL_ID}:${sheetRole}`;

/** Maximum number of months in one reporting period (fixed template capacity). */
export const MAX_PERIOD_MONTHS = 24;

/** Maximum number of category rows sent to the API. */
export const MAX_CATEGORIES = 60;

export const CURRENCY = "MYR" as const;
