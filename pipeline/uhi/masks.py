"""Urban core and rural reference masks from ESA WorldCover 2021."""
import numpy as np
from scipy import ndimage

from .config import GRID_RES_M, NEIGHBOURHOOD_RADIUS_M, WC_BUILT, WC_CROPLAND, WC_WATER, CityConfig
from .grid import Grid


def urban_mask(city: CityConfig, grid: Grid, wc: np.ndarray, dist_km: np.ndarray) -> np.ndarray:
    return (wc == WC_BUILT) & (dist_km <= city.urban_radius_km)


def rural_mask(
    ring_km: tuple[float, float], wc: np.ndarray, dist_km: np.ndarray, in_country: np.ndarray
) -> np.ndarray:
    """Homogeneous cropland in a ring around the city.

    - >=80% cropland in a ~210 m window (drops village edges and roads)
    - >=1 km from open water (the Ravi and canals cool their banks)
    - >=2 km inside the national border
    """
    crop_frac = ndimage.uniform_filter((wc == WC_CROPLAND).astype("f4"), size=7)
    water_dist_m = ndimage.distance_transform_edt(wc != WC_WATER) * GRID_RES_M
    border_dist_m = ndimage.distance_transform_edt(in_country) * GRID_RES_M
    return (
        (wc == WC_CROPLAND)
        & (crop_frac >= 0.8)
        & (water_dist_m >= 1000)
        & (border_dist_m >= 2000)
        & (dist_km >= ring_km[0])
        & (dist_km <= ring_km[1])
    )


def circle_mask(grid: Grid, lon: float, lat: float, radius_m: float = NEIGHBOURHOOD_RADIUS_M) -> np.ndarray:
    return grid.ground_distance_km(lon, lat) * 1000 <= radius_m
