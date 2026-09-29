package com.niyamstack.propel.security;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Phone normalization for Propel.
 * <p>
 * India stays stored as 10-digit national (legacy DB / OTP). Other countries are stored as
 * dial + national digits with no {@code +} (e.g. {@code 14155550100}).
 */
public final class Phones {
    private Phones() {}

    private record Country(String iso, String dial, int minNational, int maxNational) {}

    private static final List<Country> COUNTRIES = List.of(
            new Country("IN", "91", 10, 10),
            new Country("AE", "971", 8, 9),
            new Country("US", "1", 10, 10),
            new Country("CA", "1", 10, 10),
            new Country("GB", "44", 9, 10),
            new Country("AU", "61", 8, 9),
            new Country("SG", "65", 8, 8),
            new Country("NP", "977", 8, 10),
            new Country("BD", "880", 8, 10),
            new Country("LK", "94", 8, 9),
            new Country("PK", "92", 9, 10),
            new Country("SA", "966", 8, 9),
            new Country("QA", "974", 8, 8),
            new Country("OM", "968", 8, 8),
            new Country("KW", "965", 8, 8),
            new Country("BH", "973", 8, 8),
            new Country("MY", "60", 8, 10),
            new Country("DE", "49", 8, 11),
            new Country("FR", "33", 8, 9),
            new Country("NZ", "64", 8, 10)
    );

    private static final List<String> DIALS_LONGEST_FIRST = COUNTRIES.stream()
            .map(Country::dial)
            .distinct()
            .sorted(Comparator.comparingInt(String::length).reversed())
            .toList();

    public static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        String digits = raw.replaceAll("\\D", "");
        if (digits.isBlank()) {
            return "";
        }
        if (digits.startsWith("00") && digits.length() > 2) {
            digits = digits.substring(2);
        }

        // Legacy / explicit India: 10-digit mobile, 0-prefixed, or 91 + 10
        if (digits.matches("91[6-9]\\d{9}")) {
            return digits.substring(2);
        }
        if (digits.matches("0[6-9]\\d{9}")) {
            return digits.substring(1);
        }
        if (digits.matches("[6-9]\\d{9}")) {
            return digits;
        }

        for (String dial : DIALS_LONGEST_FIRST) {
            if (!digits.startsWith(dial) || digits.length() <= dial.length()) {
                continue;
            }
            String national = digits.substring(dial.length());
            if (national.startsWith("0")) {
                national = national.substring(1);
            }
            for (Country c : COUNTRIES) {
                if (!c.dial.equals(dial)) {
                    continue;
                }
                if (national.length() >= c.minNational && national.length() <= c.maxNational) {
                    if ("91".equals(dial)) {
                        return national;
                    }
                    return dial + national;
                }
            }
        }

        // Unknown but plausible E.164 body (8–15 digits)
        if (digits.matches("\\d{8,15}")) {
            return digits;
        }
        return digits;
    }

    public static boolean isMobile(String normalized) {
        if (normalized == null || normalized.isBlank()) {
            return false;
        }
        if (normalized.matches("[6-9]\\d{9}")) {
            return true;
        }
        for (String dial : DIALS_LONGEST_FIRST) {
            if (!normalized.startsWith(dial) || normalized.length() <= dial.length()) {
                continue;
            }
            String national = normalized.substring(dial.length());
            for (Country c : COUNTRIES) {
                if (!c.dial.equals(dial)) {
                    continue;
                }
                if (national.length() >= c.minNational && national.length() <= c.maxNational
                        && national.matches("\\d+")) {
                    return true;
                }
            }
        }
        // Accept other international lengths for contact phones (not only listed dials)
        return normalized.matches("[1-9]\\d{7,14}");
    }

    /** Candidates to try when looking up a user (India 10-digit vs 91-prefixed). */
    public static List<String> lookupKeys(String rawOrNormalized) {
        String n = normalize(rawOrNormalized);
        List<String> keys = new ArrayList<>();
        if (!n.isBlank()) {
            keys.add(n);
        }
        if (n.matches("[6-9]\\d{9}")) {
            keys.add("91" + n);
        } else if (n.matches("91[6-9]\\d{9}")) {
            keys.add(n.substring(2));
        }
        return keys.stream().distinct().toList();
    }
}
