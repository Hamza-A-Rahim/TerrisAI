"""The common output grid every product is resampled onto."""
import math
from dataclasses import dataclass

import numpy as np
from pyproj import Transformer
from rasterio.transform import Affine, from_origin

from .config import GRID_CRS, GRID_RES_M, CityConfig

_to_merc = Transformer.from_crs("EPSG:4326", GRID_CRS, always_xy=True)
_to_ll = Transformer.from_crs(GRID_CRS, "EPSG:4326", always_xy=True)


@dataclass(frozen=True)
class Grid:
    transform: Affine
    width: int
    height: int
    crs: str = GRID_CRS

    @property
    def shape(self) -> tuple[int, int]:
        return (self.height, self.width)

    @property
    def bounds_merc(self) -> tuple[float, float, float, float]:
        x0, y1 = self.transform.c, self.transform.f
        return (x0, y1 - self.height * GRID_RES_M, x0 + self.width * GRID_RES_M, y1)

    def corners_lonlat(self) -> list[list[float]]:
        """Top-left, top-right, bottom-right, bottom-left (MapLibre image source order)."""
        x0, y0, x1, y1 = self.bounds_merc
        pts = [(x0, y1), (x1, y1), (x1, y0), (x0, y0)]
        return [[round(v, 7) for v in _to_ll.transform(x, y)] for x, y in pts]

    def xy_lonlat(self) -> tuple[np.ndarray, np.ndarray]:
        """Lon/lat of every pixel centre."""
        cols = self.transform.c + (np.arange(self.width) + 0.5) * GRID_RES_M
        rows = self.transform.f - (np.arange(self.height) + 0.5) * GRID_RES_M
        xx, yy = np.meshgrid(cols, rows)
        return _to_ll.transform(xx, yy)

    def ground_distance_km(self, lon: float, lat: float) -> np.ndarray:
        """Great-circle-ish distance (equirectangular, fine at city scale)."""
        lons, lats = self.xy_lonlat()
        k = math.cos(math.radians(lat))
        return np.hypot((lons - lon) * 111.32 * k, (lats - lat) * 110.57)

    def pixel_of(self, lon: float, lat: float) -> tuple[int, int]:
        x, y = _to_merc.transform(lon, lat)
        col = int((x - self.transform.c) // GRID_RES_M)
        row = int((self.transform.f - y) // GRID_RES_M)
        return row, col


def make_grid(city: CityConfig) -> Grid:
    w, s, e, n = city.bbox
    x0, y0 = _to_merc.transform(w, s)
    x1, y1 = _to_merc.transform(e, n)
    # Snap to the resolution so repeated runs produce identical grids
    x0 = math.floor(x0 / GRID_RES_M) * GRID_RES_M
    y1 = math.ceil(y1 / GRID_RES_M) * GRID_RES_M
    width = math.ceil((x1 - x0) / GRID_RES_M)
    height = math.ceil((y1 - y0) / GRID_RES_M)
    return Grid(from_origin(x0, y1, GRID_RES_M, GRID_RES_M), width, height)
