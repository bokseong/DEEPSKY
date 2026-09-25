const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SYNODIC_MONTH = 29.530588853;

function toDays(date) {
  return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
}

function rightAscension(longitude, latitude) {
  const obliquity = 23.4397 * RAD;
  return Math.atan2(
    Math.sin(longitude) * Math.cos(obliquity) - Math.tan(latitude) * Math.sin(obliquity),
    Math.cos(longitude)
  );
}

function declination(longitude, latitude) {
  const obliquity = 23.4397 * RAD;
  return Math.asin(
    Math.sin(latitude) * Math.cos(obliquity) +
    Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude)
  );
}

function sunCoords(days) {
  const anomaly = RAD * (357.5291 + 0.98560028 * days);
  const longitude = anomaly + RAD * (
    1.9148 * Math.sin(anomaly) +
    0.02 * Math.sin(2 * anomaly) +
    0.0003 * Math.sin(3 * anomaly) +
    102.9372
  ) + Math.PI;
  return {
    ra: rightAscension(longitude, 0),
    dec: declination(longitude, 0)
  };
}

function moonCoords(days) {
  const meanLongitude = RAD * (218.316 + 13.176396 * days);
  const meanAnomaly = RAD * (134.963 + 13.064993 * days);
  const meanDistance = RAD * (93.272 + 13.229350 * days);
  const longitude = meanLongitude + RAD * 6.289 * Math.sin(meanAnomaly);
  const latitude = RAD * 5.128 * Math.sin(meanDistance);
  return {
    ra: rightAscension(longitude, latitude),
    dec: declination(longitude, latitude),
    distance: 385001 - 20905 * Math.cos(meanAnomaly)
  };
}

function siderealTime(days, longitudeWest) {
  return RAD * (280.16 + 360.9856235 * days) - longitudeWest;
}

function moonAltitude(date, latitude, longitude) {
  const longitudeWest = -longitude * RAD;
  const latitudeRad = latitude * RAD;
  const days = toDays(date);
  const moon = moonCoords(days);
  const hourAngle = siderealTime(days, longitudeWest) - moon.ra;
  return Math.asin(
    Math.sin(latitudeRad) * Math.sin(moon.dec) +
    Math.cos(latitudeRad) * Math.cos(moon.dec) * Math.cos(hourAngle)
  );
}

function seoulDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month) - 1, day: Number(value.day) };
}

function seoulMidnight(date) {
  const { year, month, day } = seoulDateParts(date);
  return new Date(Date.UTC(year, month, day) - KST_OFFSET_MS);
}

function refineCrossing(start, end, latitude, longitude, threshold) {
  let left = start.valueOf();
  let right = end.valueOf();
  const leftAltitude = moonAltitude(new Date(left), latitude, longitude) - threshold;
  for (let index = 0; index < 12; index += 1) {
    const middle = (left + right) / 2;
    const middleAltitude = moonAltitude(new Date(middle), latitude, longitude) - threshold;
    if ((leftAltitude <= 0 && middleAltitude <= 0) || (leftAltitude > 0 && middleAltitude > 0)) left = middle;
    else right = middle;
  }
  return new Date((left + right) / 2);
}

function moonRiseSet(date, latitude, longitude) {
  const start = seoulMidnight(date);
  const step = 10 * 60 * 1000;
  const threshold = 0.133 * RAD;
  let previousTime = start;
  let previousAltitude = moonAltitude(previousTime, latitude, longitude) - threshold;
  let rise = null;
  let set = null;

  for (let offset = step; offset <= DAY_MS; offset += step) {
    const currentTime = new Date(start.valueOf() + offset);
    const currentAltitude = moonAltitude(currentTime, latitude, longitude) - threshold;
    if (previousAltitude <= 0 && currentAltitude > 0 && !rise) {
      rise = refineCrossing(previousTime, currentTime, latitude, longitude, threshold);
    }
    if (previousAltitude > 0 && currentAltitude <= 0 && !set) {
      set = refineCrossing(previousTime, currentTime, latitude, longitude, threshold);
    }
    previousTime = currentTime;
    previousAltitude = currentAltitude;
  }
  return { rise, set };
}

function phaseLabel(phase) {
  if (phase < 0.03 || phase >= 0.97) return { label: "삭", icon: "🌑" };
  if (phase < 0.22) return { label: "초승달", icon: "🌒" };
  if (phase < 0.28) return { label: "상현달", icon: "🌓" };
  if (phase < 0.47) return { label: "차오르는 달", icon: "🌔" };
  if (phase < 0.53) return { label: "보름달", icon: "🌕" };
  if (phase < 0.72) return { label: "기우는 달", icon: "🌖" };
  if (phase < 0.78) return { label: "하현달", icon: "🌗" };
  return { label: "그믐달", icon: "🌘" };
}

export function getMoonInfo(date, latitude, longitude) {
  const days = toDays(date);
  const sun = sunCoords(days);
  const moon = moonCoords(days);
  const sunDistance = 149598000;
  const separation = Math.acos(
    Math.sin(sun.dec) * Math.sin(moon.dec) +
    Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra)
  );
  const incidence = Math.atan2(
    sunDistance * Math.sin(separation),
    moon.distance - sunDistance * Math.cos(separation)
  );
  const angle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
    Math.sin(sun.dec) * Math.cos(moon.dec) -
    Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra)
  );
  const fraction = (1 + Math.cos(incidence)) / 2;
  const phase = 0.5 + 0.5 * incidence * (angle < 0 ? -1 : 1) / Math.PI;
  const phaseMeta = phaseLabel(phase);
  return {
    ...phaseMeta,
    illumination: Math.round(fraction * 100),
    age: phase * SYNODIC_MONTH,
    ...moonRiseSet(date, latitude, longitude)
  };
}

function dayOfYear(year, month, day) {
  return Math.floor((Date.UTC(year, month, day) - Date.UTC(year, 0, 0)) / DAY_MS);
}

function sunEvent(date, latitude, longitude, altitude, rising) {
  const { year, month, day } = seoulDateParts(date);
  const ordinal = dayOfYear(year, month, day);
  const longitudeHour = longitude / 15;
  const approximateTime = ordinal + ((rising ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = 0.9856 * approximateTime - 3.289;
  let trueLongitude = meanAnomaly + 1.916 * Math.sin(meanAnomaly * RAD) + 0.02 * Math.sin(2 * meanAnomaly * RAD) + 282.634;
  trueLongitude = (trueLongitude + 360) % 360;
  let rightAscensionDegrees = Math.atan(0.91764 * Math.tan(trueLongitude * RAD)) / RAD;
  rightAscensionDegrees = (rightAscensionDegrees + 360) % 360;
  rightAscensionDegrees += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscensionDegrees / 90) * 90;
  const rightAscensionHours = rightAscensionDegrees / 15;
  const sinDeclination = 0.39782 * Math.sin(trueLongitude * RAD);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const zenith = 90 - altitude;
  const cosHourAngle = (
    Math.cos(zenith * RAD) - sinDeclination * Math.sin(latitude * RAD)
  ) / (cosDeclination * Math.cos(latitude * RAD));
  if (cosHourAngle < -1 || cosHourAngle > 1) return null;
  let hourAngle = Math.acos(cosHourAngle) / RAD;
  hourAngle = (rising ? 360 - hourAngle : hourAngle) / 15;
  const localMeanTime = hourAngle + rightAscensionHours - 0.06571 * approximateTime - 6.622;
  const utcHour = (localMeanTime - longitudeHour + 24) % 24;
  const localHour = (utcHour + 9) % 24;
  return new Date(Date.UTC(year, month, day) - KST_OFFSET_MS + localHour * 60 * 60 * 1000);
}

export function getAstronomicalTwilight(date, latitude, longitude) {
  return {
    dawn: sunEvent(date, latitude, longitude, -18, true),
    dusk: sunEvent(date, latitude, longitude, -18, false)
  };
}
