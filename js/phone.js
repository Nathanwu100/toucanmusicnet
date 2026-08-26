// Forgiving phone-number entry, shared by the signup form and the settings
// drawer so both accept exactly the same things.
//
// Storage stays strict E.164 (+15551234567) because the profiles table
// constrains it: a leading +, no zero straight after it, digits only, 11 to
// 16 characters. Only *entry* is loose. A country dropdown carries the
// dialling code so nobody has to know to type +1, and the parser below
// accepts the shapes people actually type:
//
//   555 123 4567      (spaces, dashes, dots, parentheses)
//   (555) 123-4567
//   +44 7700 900123   a full international number pasted into the box, which
//                     also re-points the dropdown at the country it names
//   004477009001 23   00 as the international prefix
//   07700 900123      a national trunk 0, which is dropped
//
// Anything left over that is not a digit is discarded rather than rejected.

(function () {
  "use strict";

  // Dialling codes, longest-first within the list so lookup prefers +1876
  // over +1. Not exhaustive -- it covers the places the school's families
  // actually call from, plus the rest of the G20.
  const COUNTRIES = [
    { iso: "US", name: "United States", dial: "1", flag: "🇺🇸" },
    { iso: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
    { iso: "MX", name: "Mexico", dial: "52", flag: "🇲🇽" },
    { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
    { iso: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
    { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
    { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
    { iso: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
    { iso: "PT", name: "Portugal", dial: "351", flag: "🇵🇹" },
    { iso: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
    { iso: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
    { iso: "BE", name: "Belgium", dial: "32", flag: "🇧🇪" },
    { iso: "CH", name: "Switzerland", dial: "41", flag: "🇨🇭" },
    { iso: "AT", name: "Austria", dial: "43", flag: "🇦🇹" },
    { iso: "SE", name: "Sweden", dial: "46", flag: "🇸🇪" },
    { iso: "NO", name: "Norway", dial: "47", flag: "🇳🇴" },
    { iso: "DK", name: "Denmark", dial: "45", flag: "🇩🇰" },
    { iso: "FI", name: "Finland", dial: "358", flag: "🇫🇮" },
    { iso: "PL", name: "Poland", dial: "48", flag: "🇵🇱" },
    { iso: "UA", name: "Ukraine", dial: "380", flag: "🇺🇦" },
    { iso: "RU", name: "Russia", dial: "7", flag: "🇷🇺" },
    { iso: "TR", name: "Türkiye", dial: "90", flag: "🇹🇷" },
    { iso: "IL", name: "Israel", dial: "972", flag: "🇮🇱" },
    { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
    { iso: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
    { iso: "EG", name: "Egypt", dial: "20", flag: "🇪🇬" },
    { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
    { iso: "KE", name: "Kenya", dial: "254", flag: "🇰🇪" },
    { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
    { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
    { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
    { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
    { iso: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
    { iso: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
    { iso: "CN", name: "China", dial: "86", flag: "🇨🇳" },
    { iso: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
    { iso: "TW", name: "Taiwan", dial: "886", flag: "🇹🇼" },
    { iso: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
    { iso: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
    { iso: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
    { iso: "VN", name: "Vietnam", dial: "84", flag: "🇻🇳" },
    { iso: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
    { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
    { iso: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
    { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
    { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
    { iso: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
    { iso: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
    { iso: "AR", name: "Argentina", dial: "54", flag: "🇦🇷" },
    { iso: "CL", name: "Chile", dial: "56", flag: "🇨🇱" },
    { iso: "CO", name: "Colombia", dial: "57", flag: "🇨🇴" },
    { iso: "PE", name: "Peru", dial: "51", flag: "🇵🇪" },
  ];

  const DEFAULT_ISO = "US";
  const MIN_DIGITS = 10;  // the constraint's length(11..16) counts the +
  const MAX_DIGITS = 15;

  const digitsOf = (value) => String(value ?? "").replace(/\D/g, "");

  function countryFor(iso) {
    return COUNTRIES.find((country) => country.iso === iso) || COUNTRIES[0];
  }

  // Longest dial code first, so +1 never shadows +351.
  function countryForDigits(digits) {
    let best = null;
    for (const country of COUNTRIES) {
      if (digits.startsWith(country.dial) && (!best || country.dial.length > best.dial.length)) {
        best = country;
      }
    }
    return best;
  }

  // Returns { e164, iso, national, valid, error }. `iso` may differ from the
  // one passed in when the typed number named its own country.
  function parse(iso, raw) {
    const country = countryFor(iso);
    const text = String(raw ?? "").trim();
    if (!text) return { e164: null, iso: country.iso, national: "", valid: false, error: "empty" };

    let digits = digitsOf(text);
    let international = text.startsWith("+");
    if (!international && digits.startsWith("00")) {
      digits = digits.slice(2);
      international = true;
    }

    if (international) {
      const named = countryForDigits(digits);
      if (named) {
        return finish(named, digits.slice(named.dial.length), digits);
      }
      return finish(country, digits.replace(new RegExp("^" + country.dial), ""), digits);
    }

    // A national number. Drop the trunk prefix that many countries write in
    // front of a domestic number but never in E.164.
    let national = digits.replace(/^0+/, "");
    // Someone who typed their own dial code without a + still means it once,
    // not twice -- but only trust that if what is left is still plausible.
    if (national.startsWith(country.dial) && national.length - country.dial.length >= MIN_DIGITS - 3) {
      national = national.slice(country.dial.length);
    }
    return finish(country, national, country.dial + national);
  }

  function finish(country, national, allDigits) {
    const total = allDigits.length;
    if (allDigits.startsWith("0")) {
      return { e164: null, iso: country.iso, national, valid: false, error: "leading-zero" };
    }
    if (total < MIN_DIGITS) {
      return { e164: null, iso: country.iso, national, valid: false, error: "too-short" };
    }
    if (total > MAX_DIGITS) {
      return { e164: null, iso: country.iso, national, valid: false, error: "too-long" };
    }
    return { e164: "+" + allDigits, iso: country.iso, national, valid: true, error: null };
  }

  // Split a stored E.164 number back into dropdown + field.
  function split(stored) {
    const digits = digitsOf(stored);
    if (!digits) return { iso: DEFAULT_ISO, national: "" };
    const country = countryForDigits(digits);
    if (!country) return { iso: DEFAULT_ISO, national: digits };
    return { iso: country.iso, national: digits.slice(country.dial.length) };
  }

  const MESSAGES = {
    empty: "Enter your mobile number.",
    "leading-zero": "That number starts with a zero after the country code. Check it and try again.",
    "too-short": "That mobile number looks too short. Check the digits and try again.",
    "too-long": "That mobile number looks too long. Check the digits and try again.",
  };
  const message = (error) => MESSAGES[error] || "Enter a valid mobile number.";

  // Builds the country <select>; the caller supplies the number <input>.
  function fillCountrySelect(select, iso = DEFAULT_ISO) {
    if (!select) return;
    select.innerHTML = "";
    COUNTRIES.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.iso;
      option.textContent = `${country.flag} ${country.name} +${country.dial}`;
      select.appendChild(option);
    });
    select.value = countryFor(iso).iso;
  }

  window.ToucanPhone = {
    COUNTRIES, DEFAULT_ISO, parse, split, message, fillCountrySelect, countryFor,
  };
})();
