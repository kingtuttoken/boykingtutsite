export type Product = {
  id: string;
  name: string;
  usd: number;
  kind: "subscription" | "order";
  category: "crypto" | "advertising";
  commissionUsd?: number;
};

export const PRODUCTS: Record<string, Product> = {
  crypto_basic: { id:"crypto_basic", name:"Crypto Basic", usd:50, kind:"subscription", category:"crypto" },
  crypto_pro: { id:"crypto_pro", name:"Crypto Pro", usd:150, kind:"subscription", category:"crypto" },
  extra_pair: { id:"extra_pair", name:"Additional Crypto Pair", usd:50, kind:"subscription", category:"crypto" },
  solo_machine: { id:"solo_machine", name:"Solo Leverage Alarm Machine", usd:300, kind:"order", category:"crypto" },
  solo_service_150: { id:"solo_service_150", name:"Solo Service — Standard", usd:150, kind:"subscription", category:"crypto" },
  solo_service_300: { id:"solo_service_300", name:"Solo Service — Advanced", usd:300, kind:"subscription", category:"crypto" },
  local_basic: { id:"local_basic", name:"Local Advertising — 15 Mile", usd:250, kind:"subscription", category:"advertising", commissionUsd:50 },
  local_plus: { id:"local_plus", name:"Local Advertising — 50 Mile", usd:399, kind:"subscription", category:"advertising", commissionUsd:100 },
  local_max: { id:"local_max", name:"Local Advertising — Expanded", usd:500, kind:"subscription", category:"advertising", commissionUsd:100 }
};

export function getProduct(id: string) {
  return PRODUCTS[id] || null;
}
