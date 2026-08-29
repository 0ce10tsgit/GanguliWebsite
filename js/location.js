export const FALLBACK_LOCATION = {
    lat: 42.33418545905304,
    lon: -71.0445458583231,
    label: "geocoding failed so here's boston",
};

export async function fetchVisitorLocation() {
    const response = await fetch('/location.php');
    if (!response.ok) {
        throw new Error('Location lookup failed with ' + response.status);
    }
    const data = await response.json();
    if (typeof data.lat !== 'number' || typeof data.lon !== 'number') {
        throw new Error('Location lookup returned no coordinates: ' + (data.message || data.status));
    }
    return data;
}