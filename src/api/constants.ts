// Public SDK key, same as the Swift AppServices.plist.
export const REVENUECAT_IOS_API_KEY = "appl_BvJoKxnxXfCaydUglCnEpRkfWFu";
export const ENTITLEMENT_ID = "SportsGPT Pro";

// App Store product IDs (fallback when a RevenueCat offering package is unavailable),
// same as the Swift AppServices.plist.
export const PRODUCT_IDS = {
  yearly: "SportsGPT_PRO",
  lifetime: "SportsGPT_PRO_Lifetime",
  monthly: "SportsGPT_PRO_Monthly_999",
} as const;
