import logging
import math
import random
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pre-populated coordinates for major cities and areas
# ---------------------------------------------------------------------------
CITY_AREA_COORDS = {
    # Major Indian Cities
    "bangalore": (12.9716, 77.5946),
    "bengaluru": (12.9716, 77.5946),
    "mumbai":    (19.0760, 72.8777),
    "delhi":     (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "chennai":   (13.0827, 80.2707),
    "hyderabad": (17.3850, 78.4867),
    "pune":      (18.5204, 73.8567),
    "kolkata":   (22.5726, 88.3639),
    "ahmedabad": (23.0225, 72.5714),
    "jaipur":    (26.9124, 75.7873),
    "surat":     (21.1702, 72.8311),
    "lucknow":   (26.8467, 80.9462),
    "kanpur":    (26.4499, 80.3319),
    "nagpur":    (21.1458, 79.0882),
    "indore":    (22.7196, 75.8577),
    "thane":     (19.2183, 72.9781),
    "bhopal":    (23.2599, 77.4126),
    "visakhapatnam": (17.6868, 83.2185),
    "patna":     (25.5941, 85.1376),
    "vadodara":  (22.3072, 73.1812),
    "ghaziabad": (28.6692, 77.4538),
    "ludhiana":  (30.9010, 75.8573),
    "agra":      (27.1767, 78.0081),
    "nashik":    (19.9975, 73.7898),
    "faridabad": (28.4089, 77.3178),
    "meerut":    (28.9845, 77.7064),
    "rajkot":    (22.3039, 70.8022),
    "varanasi":  (25.3176, 82.9739),
    "srinagar":  (34.0837, 74.7973),
    "aurangabad":(19.8762, 75.3433),
    "dhanbad":   (23.7957, 86.4304),
    "amritsar":  (31.6340, 74.8723),
    "navi mumbai": (19.0330, 73.0297),
    "allahabad": (25.4358, 81.8463),
    "prayagraj": (25.4358, 81.8463),
    "howrah":    (22.5958, 88.2636),
    "ranchi":    (23.3441, 85.3096),
    "gwalior":   (26.2183, 78.1828),
    "jabalpur":  (23.1815, 79.9864),
    "coimbatore":(11.0168, 76.9558),
    "vijayawada":(16.5062, 80.6480),
    "jodhpur":   (26.2389, 73.0243),
    "madurai":   (9.9252, 78.1198),
    "raipur":    (21.2514, 81.6296),
    "kota":      (25.2138, 75.8648),
    "chandigarh":(30.7333, 76.7794),
    "guwahati":  (26.1445, 91.7362),
    "mysore":    (12.2958, 76.6394),
    "mysuru":    (12.2958, 76.6394),
    "gurgaon":   (28.4595, 77.0266),
    "gurugram":  (28.4595, 77.0266),
    "noida":     (28.5355, 77.3910),
    "kochi":     (9.9312, 76.2673),
    "cochin":    (9.9312, 76.2673),
    "trivandrum":(8.5241, 76.9366),
    "thiruvananthapuram": (8.5241, 76.9366),

    # Bangalore areas
    "koramangala":     (12.9352, 77.6245),
    "indiranagar":     (12.9784, 77.6408),
    "jayanagar":       (12.9308, 77.5838),
    "whitefield":      (12.9698, 77.7500),
    "rajajinagar":     (12.9907, 77.5530),
    "banashankari":    (12.9255, 77.5468),
    "hebbal":          (13.0354, 77.5972),
    "kengeri":         (12.8996, 77.4827),
    "marathahalli":    (12.9591, 77.6974),
    "btm layout":      (12.9166, 77.6101),
    "hsr layout":      (12.9116, 77.6389),
    "electronic city": (12.8399, 77.6770),
    "malleswaram":     (12.9997, 77.5713),
    "bellandur":       (12.9263, 77.6756),
    "jp nagar":        (12.9082, 77.5858),
    "yelahanka":       (13.1007, 77.5963),

    # Mumbai areas
    "bandra":  (19.0596, 72.8295),
    "andheri": (19.1136, 72.8697),
    "worli":   (19.0176, 72.8172),
    "dadar":   (19.0178, 72.8478),
    "powai":   (19.1176, 72.9060),
    "juhu":    (19.1075, 72.8263),
    "malad":   (19.1874, 72.8484),
    "vashi":   (19.0770, 72.9986),
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in kilometers between two lat/lng coordinates."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)


def resolve_coords_sync(
    city: str | None = None,
    address: str | None = None,
) -> tuple[float | None, float | None]:
    """
    Synchronous resolution using fast dictionary and substring lookup.
    Checks address/area first, then city.
    """
    try:
        if address and isinstance(address, str):
            addr_clean = address.strip().lower()
            if addr_clean in CITY_AREA_COORDS:
                return CITY_AREA_COORDS[addr_clean]
            for known_area, coords in CITY_AREA_COORDS.items():
                if known_area in addr_clean:
                    return coords

        if city and isinstance(city, str):
            city_clean = city.strip().lower()
            if city_clean in CITY_AREA_COORDS:
                return CITY_AREA_COORDS[city_clean]
            for known_city, coords in CITY_AREA_COORDS.items():
                if known_city in city_clean:
                    return coords

        return (None, None)
    except Exception as exc:
        logger.warning("Error in resolve_coords_sync: %s", exc)
        return (None, None)


async def resolve_coords(
    city: str | None = None,
    address: str | None = None,
) -> tuple[float | None, float | None]:
    """
    Async 3-tier coordinate resolution:
      1. Static dictionary / substring lookup (fastest).
      2. Nominatim OpenStreetMap Geocoding API.
      3. Fallback to None if not resolved.
    """
    # 1. Try static map first
    coords = resolve_coords_sync(city=city, address=address)
    if coords[0] is not None and coords[1] is not None:
        return coords

    # 2. Try Nominatim Geocoding API
    query_parts = []
    if address:
        query_parts.append(address.strip())
    if city:
        query_parts.append(city.strip())

    if not query_parts:
        return (None, None)

    query = ", ".join(query_parts)
    try:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "MedAssist-App/1.0 (contact@medassist.local)"}
        params = {"q": query, "format": "json", "limit": 1}

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    return (lat, lon)
    except Exception as exc:
        logger.warning("Nominatim geocoding failed for '%s': %s", query, exc)

    # Secondary Nominatim attempt with just city if address+city failed
    if address and city:
        try:
            url = "https://nominatim.openstreetmap.org/search"
            headers = {"User-Agent": "MedAssist-App/1.0 (contact@medassist.local)"}
            params = {"q": city.strip(), "format": "json", "limit": 1}
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, params=params, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        lat = float(data[0]["lat"])
                        lon = float(data[0]["lon"])
                        return (lat, lon)
        except Exception as exc:
            logger.warning("Nominatim city-only geocoding failed for '%s': %s", city, exc)

    return (None, None)


def resolve_doctor_display_coords(
    doctor: Any,
    fallback_city: str | None = None,
) -> tuple[float, float]:
    """
    Resolve display coordinates for a doctor with deterministic jitter fallback.

    1. Returns (practice_lat, practice_lng) if both are present and non-zero.
    2. Otherwise, resolves base coordinates from practice_address area or practice_city.
    3. If unresolved, falls back to fallback_city (e.g. search city) or Bangalore center (12.9716, 77.5946).
    4. Applies deterministic jitter seeded by doctor.id so the position is consistent across calls.
    """
    if isinstance(doctor, dict):
        lat = doctor.get("practice_lat") or 0.0
        lng = doctor.get("practice_lng") or 0.0
        address = doctor.get("practice_address") or ""
        city = doctor.get("practice_city") or ""
        doc_id = doctor.get("id") or 0
    else:
        lat = getattr(doctor, "practice_lat", None) or 0.0
        lng = getattr(doctor, "practice_lng", None) or 0.0
        address = getattr(doctor, "practice_address", None) or ""
        city = getattr(doctor, "practice_city", None) or ""
        doc_id = getattr(doctor, "id", None) or 0

    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        lat_f, lng_f = 0.0, 0.0

    if lat_f != 0.0 and lng_f != 0.0:
        return (lat_f, lng_f)

    # Missing coordinates: resolve base from address area, doctor city, or fallback city
    doc_address = address.lower()
    matched_area = next(
        (coords for area_name, coords in CITY_AREA_COORDS.items() if area_name.lower() in doc_address),
        None,
    )
    if matched_area:
        base_lat, base_lng = matched_area
    else:
        doc_city = city.strip().lower()
        matched_key = next((k for k in CITY_AREA_COORDS if k.lower() == doc_city), None)
        if matched_key is None and fallback_city:
            matched_key = next((k for k in CITY_AREA_COORDS if k.lower() == fallback_city.strip().lower()), None)
        if matched_key is not None:
            base_lat, base_lng = CITY_AREA_COORDS[matched_key]
        else:
            base_lat, base_lng = (12.9716, 77.5946)

    try:
        seed_id = int(doc_id)
    except (TypeError, ValueError):
        seed_id = 0

    rng_lat = random.Random(seed_id * 2)
    rng_lng = random.Random(seed_id * 2 + 1)
    jitter_lat = rng_lat.uniform(-0.008, 0.008)
    jitter_lng = rng_lng.uniform(-0.008, 0.008)

    return (round(base_lat + jitter_lat, 6), round(base_lng + jitter_lng, 6))
