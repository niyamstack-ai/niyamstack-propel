package com.niyamstack.propel.security;

public final class Phones {
    private Phones() {}

    public static String normalize(String raw) {
        if (raw == null) {
            return "";
        }
        String digits = raw.replaceAll("\\D", "");
        if (digits.startsWith("91") && digits.length() == 12) {
            digits = digits.substring(2);
        }
        if (digits.startsWith("0") && digits.length() == 11) {
            digits = digits.substring(1);
        }
        return digits;
    }

    public static boolean isMobile(String normalized) {
        return normalized != null && normalized.matches("[6-9]\\d{9}");
    }
}
