/** Seller uploads are intentionally paused until a tested storage provider is available.
 * Enabled only by explicit non-production/production configuration after integration UAT.
 */
export const sellerUploadsEnabled = process.env.NEXT_PUBLIC_SELL_UPLOAD_ENABLED === "true";
