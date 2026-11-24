/* Leonida map helper (Leaflet CRS.Simple). Shared by the Studio and the public gallery.
   Map units 0..1024 (latitude = -y) — the space of every saved pin and of leonida-places.json.
   Official map: Rockstar's "Leonida Map" poster, tiled by map_official.py and placed in that
   space by calibration (window.LFN_MAP_IMG, from /map/config.js).
   Fallback when it is missing: Open GTA 6 Map tiles (fbritoferreira), CC BY 4.0. */
(function () {
  "use strict";
  var IMG = window.LFN_MAP_IMG || null;
  var TILE_BASE = window.LFN_TILE_BASE || "/tiles/"; // fallback: cache local (baixa uma vez, depois funciona offline)
  var PLACES = 'lugares: <a href="https://github.com/fbritoferreira/gta6" target="_blank" rel="noopener">Open GTA 6 Map</a> ' +
    '(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)';
  var LEAFLET = '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>';
  var CREDIT = IMG
    ? 'Mapa © <a href="https://www.rockstargames.com/VI/media" target="_blank" rel="noopener">Rockstar Games</a> · ' + PLACES + ' · ' + LEAFLET
    : 'Mapa: <a href="https://github.com/fbritoferreira/gta6" target="_blank" rel="noopener">Open GTA 6 Map</a> ' +
      '(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>) · ' + LEAFLET;
  var BOUNDS = IMG ? [[-IMG.bounds[3], IMG.bounds[0]], [-IMG.bounds[1], IMG.bounds[2]]] : [[-1024, 0], [0, 1024]];

  function toLatLng(x, y) { return [-y, x]; }
  function fromLatLng(ll) {
    return { x: Math.min(1024, Math.max(0, ll.lng)), y: Math.min(1024, Math.max(0, -ll.lat)) };
  }

  function create(el, opts) {
    opts = opts || {};
    var pad = IMG ? 40 : 100;
    var map = L.map(el, {
      crs: L.CRS.Simple, minZoom: IMG ? -1 : 0, maxZoom: 7, zoomSnap: 0.25, zoomDelta: 0.5,
      maxBounds: [[BOUNDS[0][0] - pad, BOUNDS[0][1] - pad], [BOUNDS[1][0] + pad, BOUNDS[1][1] + pad]],
      maxBoundsViscosity: 0.9,
      attributionControl: false, zoomControl: opts.zoomControl !== false,
      tapTolerance: 20, worldCopyJump: false,
    });
    L.control.attribution({ prefix: false, position: "bottomright" }).addAttribution(CREDIT).addTo(map);
    var layers = {}, current;
    if (IMG) {
      // Sea around the poster, drawn inside the tile pane so page filters (B&W theme) also apply to it.
      var bgPane = map.createPane("lfnSea", map.getPane("tilePane"));
      bgPane.style.zIndex = 0;
      L.rectangle([[BOUNDS[0][0] - 600, BOUNDS[0][1] - 600], [BOUNDS[1][0] + 600, BOUNDS[1][1] + 600]], {
        renderer: L.svg({ pane: "lfnSea", padding: 1 }), stroke: false, fillColor: IMG.bg || "#00a9c8",
        fillOpacity: 1, interactive: false,
      }).addTo(map);
      layers.official = L.tileLayer((window.LFN_MAP_BASE || "/map/") + "{z}/{x}_{y}.webp?v=" + IMG.sig, {
        tileSize: 256, minZoom: -1, maxZoom: 7, minNativeZoom: 0, maxNativeZoom: IMG.maxNative,
        noWrap: true, bounds: BOUNDS, keepBuffer: 4,
      });
      current = "official";
    } else {
      ["night", "day"].forEach(function (style) {
        layers[style] = L.tileLayer(TILE_BASE + style + "/{z}/{z},{y},{x}.webp", {
          tileSize: 256, minZoom: 0, maxZoom: 7, maxNativeZoom: 5, noWrap: true, bounds: BOUNDS,
          keepBuffer: 4,
        });
      });
      current = opts.style === "day" ? "day" : "night";
    }
    layers[current].addTo(map);
    map.fitBounds(opts.fit || [[-760, 220], [-300, 700]]); // Vice City & arredores
    map.leonidaStyle = function (style) {
      if (style === current || !layers[style]) return current;
      map.removeLayer(layers[current]); layers[style].addTo(map); current = style;
      return current;
    };
    map.leonidaCurrentStyle = function () { return current; };
    return map;
  }

  window.LeonidaMap = {
    create: create, toLatLng: toLatLng, fromLatLng: fromLatLng, CREDIT: CREDIT,
    official: !!IMG, hasStyles: !IMG, bounds: BOUNDS,
  };
})();
