import { Agency } from '../types/pharmacy';

export interface AgencyMatchResult {
  matchedAgency: Agency | null;
  confidence: 'HIGH' | 'LOW';
  matchType: 'EXACT_GSTIN' | 'EXACT_NAME' | 'STEM_MATCH' | 'FUZZY_MATCH' | 'PHONE_MATCH' | 'NONE';
  suggestedName: string;
  reason: string;
  isUncertain: boolean;
  isNewAgency?: boolean;
  cannotIdentify?: boolean;
}

/**
 * Strips legal, trade, and commercial suffixes to isolate core distributor name
 */
export function cleanAgencyName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[.,\-_/\\()&]/g, ' ')
    .replace(/\b(PVT|LTD|PRIVATE|LIMITED|DISTRIBUTORS|DISTRIBUTOR|DIST|AGENCIES|AGENCY|PHARMA|PHARMACEUTICALS|ENTERPRISES|HEALTHCARE|MEDICAL|MEDICINE|MEDICINES|STORE|STORES|STOCKIST|STOCKISTS|CO|COMPANY|AND|THE|OF|CARE|DRUG|DRUGS|CORP|TRADERS|TRADING|SURGICALS|SURGICAL)\b/gi, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Computes Dice Coefficient similarity between two strings (0.0 to 1.0)
 */
function stringSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const str2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (str1 === str2) return 1.0;
  if (str1.length < 2 || str2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  let intersection = 0;

  for (const [key, count1] of b1.entries()) {
    const count2 = b2.get(key) || 0;
    intersection += Math.min(count1, count2);
  }

  const total = (str1.length - 1) + (str2.length - 1);
  return total > 0 ? (2.0 * intersection) / total : 0;
}

/**
 * Matches an extracted agency name/GSTIN against the registered agency database
 * Strict priority (Requirements 4 & 5):
 * 1. GSTIN exact match (strong unique statutory identifier)
 * 2. Exact/strong supplier identity match
 * 3. Bill supplier details (phone/address)
 * 4. Agency name similarity ONLY as a secondary signal (never merge entities like Venu Medical vs Uday Medical)
 */
export function matchAgency(
  detectedName: string = '',
  detectedGstin: string = '',
  detectedPhone: string = '',
  registeredAgencies: Agency[] = []
): AgencyMatchResult {
  const cleanDetected = detectedName.trim();
  const cleanDetectedUpper = cleanDetected.toUpperCase();
  const cleanGstin = detectedGstin.trim().toUpperCase();
  const cleanPhone = detectedPhone.replace(/\D/g, '');
  const stemDetected = cleanAgencyName(cleanDetected);

  // Check if detected name is illegible or missing (Requirement 5: Low-Confidence Detection)
  const isNameMissingOrUnclear =
    !cleanDetected ||
    cleanDetectedUpper === 'NOT DETECTED' ||
    cleanDetectedUpper === 'NEEDS REVIEW' ||
    cleanDetectedUpper === 'UNCLEAR' ||
    cleanDetectedUpper === 'UNKNOWN' ||
    cleanDetectedUpper === 'N/A';

  const isGstinMissingOrUnclear =
    !cleanGstin ||
    cleanGstin === 'NOT DETECTED' ||
    cleanGstin === 'NEEDS REVIEW' ||
    cleanGstin.length < 10;

  if (isNameMissingOrUnclear && isGstinMissingOrUnclear) {
    return {
      matchedAgency: null,
      confidence: 'LOW',
      matchType: 'NONE',
      suggestedName: '',
      reason: 'Agency could not be confidently identified.',
      isUncertain: true,
      cannotIdentify: true,
    };
  }

  if (!registeredAgencies || registeredAgencies.length === 0) {
    return {
      matchedAgency: null,
      confidence: 'LOW',
      matchType: 'NONE',
      suggestedName: cleanDetected || 'Unregistered Supplier',
      reason: 'No registered agencies exist in system yet.',
      isUncertain: true,
      isNewAgency: true,
    };
  }

  // 1. GSTIN exact match (Priority 1: 100% rock solid identifier)
  if (!isGstinMissingOrUnclear) {
    const match = registeredAgencies.find(
      (a) => a.gstin && a.gstin.trim().toUpperCase() === cleanGstin
    );
    if (match) {
      return {
        matchedAgency: match,
        confidence: 'HIGH',
        matchType: 'EXACT_GSTIN',
        suggestedName: match.name,
        reason: `Matched registered agency "${match.name}" by exact GSTIN (${match.gstin}).`,
        isUncertain: false,
      };
    }

    // 1b. Embedded PAN match (Chars 2-12 in GSTIN: captures bills where OCR confused check digits)
    if (cleanGstin.length >= 12) {
      const billPan = cleanGstin.slice(2, 12);
      const panMatch = registeredAgencies.find((a) => {
        const aGstin = (a.gstin || '').trim().toUpperCase();
        return aGstin.length >= 12 && aGstin.slice(2, 12) === billPan;
      });
      if (panMatch) {
        return {
          matchedAgency: panMatch,
          confidence: 'HIGH',
          matchType: 'EXACT_GSTIN',
          suggestedName: panMatch.name,
          reason: `Matched registered agency "${panMatch.name}" via PAN entity alignment (${billPan}).`,
          isUncertain: false,
        };
      }
    }
  }

  // Helper: check if a candidate agency has a conflicting GSTIN with the bill
  const hasGstinConflict = (candidate: Agency): boolean => {
    if (!candidate.gstin) return false;
    const candGstin = candidate.gstin.trim().toUpperCase();
    if (!candGstin || candGstin === 'NOT DETECTED') return false;
    if (isGstinMissingOrUnclear) return false;
    // Both bill and candidate have valid GSTINs, but they are different!
    return candGstin !== cleanGstin;
  };

  // 2. Exact name match (Priority 2)
  if (!isNameMissingOrUnclear) {
    const exact = registeredAgencies.find(
      (a) => a.name.trim().toUpperCase() === cleanDetectedUpper
    );
    if (exact && !hasGstinConflict(exact)) {
      return {
        matchedAgency: exact,
        confidence: 'HIGH',
        matchType: 'EXACT_NAME',
        suggestedName: exact.name,
        reason: `Exact match found for registered supplier "${exact.name}".`,
        isUncertain: false,
      };
    }
  }

  // 3. Significant Core Stem match (Priority 2 continuation)
  // E.g. "Venu Medical Stores" matches "Venu Medical", BUT "Uday Medical" must NEVER match "Venu Medical"!
  if (!isNameMissingOrUnclear && stemDetected.length >= 3) {
    for (const ag of registeredAgencies) {
      if (hasGstinConflict(ag)) continue; // Never match across different GSTINs

      const agStem = cleanAgencyName(ag.name);
      if (agStem.length >= 3) {
        // Crucial: Core distinctive words must be IDENTICAL or one is prefix/suffix of the other
        // Example: "VENU" === "VENU", "MEDPLUS" === "MEDPLUS"
        // NOT "UDAY" vs "VENU"
        if (agStem === stemDetected) {
          return {
            matchedAgency: ag,
            confidence: 'HIGH',
            matchType: 'STEM_MATCH',
            suggestedName: ag.name,
            reason: `Matched registered supplier "${ag.name}" (core business name match).`,
            isUncertain: false,
          };
        }
      }
    }
  }

  // 4. Phone number match (Priority 3)
  if (cleanPhone.length >= 10) {
    const phoneMatch = registeredAgencies.find((a) => {
      if (hasGstinConflict(a)) return false;
      const p = (a.phone || '').replace(/\D/g, '');
      return p.length >= 10 && (p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p));
    });
    if (phoneMatch) {
      return {
        matchedAgency: phoneMatch,
        confidence: 'HIGH',
        matchType: 'PHONE_MATCH',
        suggestedName: phoneMatch.name,
        reason: `Matched supplier "${phoneMatch.name}" by phone number (${phoneMatch.phone}).`,
        isUncertain: false,
      };
    }
  }

  // 5. Secondary fuzzy signal (Priority 4): ONLY on the distinctive core stem, never generic words!
  // E.g. minor OCR typo like "Venuu" vs "Venu", but NEVER "Uday" vs "Venu"
  if (!isNameMissingOrUnclear && stemDetected.length >= 4) {
    let bestSimilarity = 0;
    let bestMatch: Agency | null = null;

    for (const ag of registeredAgencies) {
      if (hasGstinConflict(ag)) continue;
      const agStem = cleanAgencyName(ag.name);
      if (agStem.length >= 4) {
        const sim = stringSimilarity(stemDetected, agStem);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestMatch = ag;
        }
      }
    }

    // High threshold (>= 0.88) required on the core stem specifically
    if (bestMatch && bestSimilarity >= 0.88) {
      return {
        matchedAgency: bestMatch,
        confidence: 'HIGH',
        matchType: 'FUZZY_MATCH',
        suggestedName: bestMatch.name,
        reason: `Suggested match "${bestMatch.name}" (${Math.round(bestSimilarity * 100)}% match with "${cleanDetected}").`,
        isUncertain: false,
      };
    }
  }

  // If agency name is detected but not in registered agencies (or has different GSTIN)
  // Requirement 4: "New Agency Detected"
  if (!isNameMissingOrUnclear) {
    return {
      matchedAgency: null,
      confidence: 'LOW',
      matchType: 'NONE',
      suggestedName: cleanDetected,
      reason: `New Agency Detected: "${cleanDetected}". Not found in registered agencies.`,
      isUncertain: true,
      isNewAgency: true,
    };
  }

  // Unclear / Low confidence
  return {
    matchedAgency: null,
    confidence: 'LOW',
    matchType: 'NONE',
    suggestedName: '',
    reason: 'Agency could not be confidently identified.',
    isUncertain: true,
    cannotIdentify: true,
  };
}
