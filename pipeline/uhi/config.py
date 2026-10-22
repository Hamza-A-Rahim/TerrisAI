"""Study-area and processing configuration.

Every number that affects the science lives here so the methodology docs can
point at one place. Change a city by adding another CityConfig.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Neighbourhood:
    id: str
    name: str
    query: str  # Nominatim query used to geocode the centroid
    # Fixed centroid (lon, lat) when geocoding returns the wrong feature;
    # `query` then documents where the coordinates came from.
    fixed: tuple[float, float] | None = None


@dataclass(frozen=True)
class CityConfig:
    id: str
    name: str
    # Study area (lon/lat). Must sit inside a single Landsat WRS-2 footprint so
    # every observation shares one overpass time.
    bbox: tuple[float, float, float, float]
    wrs_path: str
    wrs_row: str
    center: tuple[float, float]
    country_iso3: str
    # Urban core: WorldCover built-up pixels within this radius of the centre.
    urban_radius_km: float
    # Rural reference ring: stable cropland between these radii, inside the
    # country, away from water and the border.
    rural_ring_km: tuple[float, float]
    rural_ring_alt_km: tuple[float, float]  # sensitivity check
    neighbourhoods: list[Neighbourhood] = field(default_factory=list)


LAHORE = CityConfig(
    id="lahore",
    name="Lahore",
    bbox=(73.95, 31.15, 74.75, 31.85),
    wrs_path="149",
    wrs_row="038",
    center=(74.3436, 31.5204),
    country_iso3="PAK",
    urban_radius_km=18.0,
    rural_ring_km=(25.0, 40.0),
    rural_ring_alt_km=(20.0, 30.0),
    neighbourhoods=[
        Neighbourhood("gulberg", "Gulberg", "Gulberg, Lahore, Pakistan"),
        Neighbourhood("dha", "DHA (Defence)", "Defence Housing Authority, Lahore, Pakistan"),
        Neighbourhood("johar-town", "Johar Town", "Johar Town, Lahore, Pakistan"),
        Neighbourhood("model-town", "Model Town", "Model Town, Lahore, Pakistan"),
        Neighbourhood("walled-city", "Walled City", "Walled City of Lahore, Pakistan"),
        Neighbourhood("bahria-town", "Bahria Town", "Bahria Town, Lahore, Pakistan"),
        Neighbourhood("shalimar", "Shalimar", "Shalimar Gardens, Lahore, Pakistan"),
        # Nominatim's top hit for "Lahore Cantt" is the railway station, so use
        # the OSM place=town node for the cantonment itself.
        Neighbourhood("cantt", "Cantt", "OSM place node 'Lahore Cantt' (place=town)", fixed=(74.3790, 31.5221)),
    ],
)

CITIES = {LAHORE.id: LAHORE}

YEARS = list(range(2014, 2026))
SEASON_MONTHS = (5, 6)  # May-June: hottest, clearest pre-monsoon window
PERIODS = {
    "p2014_2016": (2014, 2016),
    "p2023_2025": (2023, 2025),
}

# Output grid: Web Mercator so overlays map exactly onto MapLibre's projection.
# 35 m in mercator units is ~29.8 m on the ground at 31.5 deg N.
GRID_CRS = "EPSG:3857"
GRID_RES_M = 35.0

# Scene screening
MAX_SCENE_CLOUD = 60.0          # % (scene-level metadata, coarse first pass)
MIN_URBAN_VALID_FRACTION = 0.6  # pixel-level, after QA masking
MIN_RURAL_VALID_FRACTION = 0.5
NEIGHBOURHOOD_RADIUS_M = 1000.0

# Collection 2 Level-2 scale factors (USGS Landsat C2 L2 Science Product Guide)
ST_SCALE, ST_OFFSET = 0.00341802, 149.0
ST_QA_SCALE = 0.01
SR_SCALE, SR_OFFSET = 2.75e-5, -0.2

# QA_PIXEL bits to reject: fill, dilated cloud, cirrus, cloud, cloud shadow, snow
QA_REJECT_BITS = (0, 1, 2, 3, 4, 5)

# WorldCover v200 classes
WC_BUILT = 50
WC_CROPLAND = 40
WC_WATER = 80

# Fixed display ranges so colours mean the same thing in every year
DISPLAY = {
    "lst": {"min": 30.0, "max": 60.0, "unit": "°C", "cmap": "inferno"},
    "anom": {"min": -8.0, "max": 8.0, "unit": "°C", "cmap": "RdBu_r"},
    "ndvi": {"min": 0.0, "max": 0.7, "unit": "NDVI", "cmap": "YlGn"},
    "d_anom": {"min": -5.0, "max": 5.0, "unit": "°C", "cmap": "RdBu_r"},
    "d_ndvi": {"min": -0.3, "max": 0.3, "unit": "NDVI", "cmap": "BrBG"},
}
