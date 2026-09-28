import { locationKey } from './domain';

export type MatchRequirement = {
  type: string;
  areas: string[];
  maxBudget: number;
  minBudget?: number;
  minSize?: number;
  idealSize?: number;
};

export type MatchProperty = {
  id: string;
  type: string;
  area: string;
  asking: number;
  size: number;
  status?: string;
};

export type MatchBreakdown = {
  propertyId: string;
  eligible: boolean;
  score: number;
  components: {
    location: number;
    price: number;
    size: number;
    type: number;
  };
  reasons: string[];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function sameType(propertyType: string, requirementType: string) {
  return locationKey(propertyType) === locationKey(requirementType);
}

function locationScore(propertyArea: string, wantedAreas: string[]) {
  if (!wantedAreas.length) return 1;
  const property = locationKey(propertyArea);
  const normalized = wantedAreas.map(locationKey).filter(Boolean);
  if (normalized.includes(property)) return 1;
  // Locality strings frequently include a broader city after a comma. A partial
  // containment is useful but deliberately worth less than an exact locality.
  if (normalized.some((area) => property.includes(area) || area.includes(property))) return 0.7;
  return 0;
}

function priceScore(asking: number, minBudget: number | undefined, maxBudget: number) {
  if (!Number.isFinite(asking) || asking <= 0 || !Number.isFinite(maxBudget) || maxBudget <= 0) return 0;
  const min = minBudget && minBudget > 0 ? Math.min(minBudget, maxBudget) : 0;
  if (asking >= min && asking <= maxBudget) return 1;
  if (asking < min && min > 0) {
    // Below the preferred band is still affordable, just less ideal.
    return clamp01(1 - ((min - asking) / min) * 0.5);
  }
  // Allow a small near-budget band so brokers can still see negotiable options.
  const over = (asking - maxBudget) / maxBudget;
  return over <= 0.1 ? clamp01(1 - over / 0.1) : 0;
}

function sizeScore(size: number, minSize = 0, idealSize?: number) {
  if (!Number.isFinite(size) || size <= 0) return 0;
  const minimum = Math.max(0, minSize || 0);
  if (minimum > 0 && size < minimum) {
    const shortfall = (minimum - size) / minimum;
    return shortfall <= 0.1 ? clamp01(1 - shortfall / 0.1) : 0;
  }
  if (idealSize && idealSize > minimum) {
    const distance = Math.abs(size - idealSize) / idealSize;
    return clamp01(1 - Math.min(distance, 1) * 0.35);
  }
  return 1;
}

/**
 * Explainable GENZ property matching.
 *
 * Design provenance:
 * - InsulaCRM's MIT-licensed BuyerMatchService uses explicit weighted criteria
 *   for location, property type and price.
 * - radcrew/real-estate-consultant's MIT-licensed search scoring separates
 *   component scores and blends location/price/size into an explainable total.
 *
 * GENZ changes the criteria, weights, near-match tolerance and data model for
 * Indian broker requirements. It never uses an LLM to decide eligibility.
 */
export function scorePropertyMatch(property: MatchProperty, requirement: MatchRequirement): MatchBreakdown {
  const reasons: string[] = [];
  if (property.status && property.status !== 'active') {
    return {propertyId:property.id,eligible:false,score:0,components:{location:0,price:0,size:0,type:0},reasons:['Property is not active.']};
  }

  const type = sameType(property.type, requirement.type) ? 1 : 0;
  const location = locationScore(property.area, requirement.areas);
  const price = priceScore(property.asking, requirement.minBudget, requirement.maxBudget);
  const size = sizeScore(property.size, requirement.minSize, requirement.idealSize);

  if (!type) reasons.push('Property type does not match the requirement.');
  if (!location) reasons.push('Location is outside the requested areas.');
  if (!price) reasons.push('Price is outside the allowed near-budget range.');
  if (!size) reasons.push('Property size is materially below the minimum.');

  // Type is a hard gate. Price and size permit a small negotiable near-match band.
  const eligible = Boolean(type && location && price && size);
  if (!eligible) {
    return {
      propertyId: property.id,
      eligible: false,
      score: 0,
      components: {location:Math.round(location*100),price:Math.round(price*100),size:Math.round(size*100),type:Math.round(type*100)},
      reasons,
    };
  }

  // Network relevance: locality and affordability matter most, then type/size.
  const score = Math.round(100 * (0.35 * location + 0.30 * price + 0.20 * type + 0.15 * size));
  if (location === 1) reasons.push('Exact requested locality match.');
  else reasons.push('Broader/partial locality match.');
  if (price === 1) reasons.push('Within stated budget.');
  else reasons.push('Near stated budget; negotiation may be required.');
  if (size === 1) reasons.push('Meets stated size preference.');
  else reasons.push('Near stated size preference.');

  return {
    propertyId: property.id,
    eligible: true,
    score,
    components: {
      location: Math.round(location * 100),
      price: Math.round(price * 100),
      size: Math.round(size * 100),
      type: Math.round(type * 100),
    },
    reasons,
  };
}

export function rankPropertyMatches(properties: MatchProperty[], requirement: MatchRequirement) {
  return properties
    .map((property) => scorePropertyMatch(property, requirement))
    .filter((match) => match.eligible)
    .sort((a, b) => b.score - a.score || a.propertyId.localeCompare(b.propertyId));
}
