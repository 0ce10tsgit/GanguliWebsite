import { FALLBACK_LOCATION, fetchVisitorLocation } from './location.js';
import { run, toggleDiagnostics, toggleRoadDebug } from './map-scene.js';

const cityInfoBtn = document.getElementById('city-info-btn');
const cityTooltip = document.getElementById('city-tooltip');
const cityLabel = document.getElementById('city');
const debugToggle = document.getElementById('debug-toggle');
const roadDebugToggle = document.getElementById('road-debug-toggle');

cityInfoBtn.addEventListener('click', () => {
    cityTooltip.classList.toggle('visible');
});

document.addEventListener('click', (event) => {
    if (event.target !== cityInfoBtn) cityTooltip.classList.remove('visible');
});

debugToggle.addEventListener('click', toggleDiagnostics);
roadDebugToggle.addEventListener('click', toggleRoadDebug);

fetchVisitorLocation()
    .then(({ lat, lon }) => {
        run(lat, lon);
    })
    .catch(() => {
        cityLabel.textContent = FALLBACK_LOCATION.label;
        run(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lon);
    });