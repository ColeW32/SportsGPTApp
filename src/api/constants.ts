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

// Juiced backend — serves sportsbook links and in-app support chat.
export const JUICED_API_BASE = "https://api.juicedbets.io/v1";

// Legal links App Review requires in the purchase flow (guideline 3.1.2): the App Store
// description names Apple's standard EULA as the Terms of Use.
export const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const PRIVACY_POLICY_URL = "https://sports-gpt-website.vercel.app/privacy.html";
export const TERMS_OF_SERVICE_URL = "https://sports-gpt-website.vercel.app/terms.html";
