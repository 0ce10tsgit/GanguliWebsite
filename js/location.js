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
    return response.json();
}