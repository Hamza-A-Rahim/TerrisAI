"""Colourised WebP overlays and the colour ramps the web legend reuses."""
from pathlib import Path

import numpy as np
from matplotlib import colormaps
from PIL import Image

NODATA_RGBA = (128, 128, 128, 90)  # visible grey wash: "no valid observation here"


def ramp(cmap: str, n: int = 9) -> list[str]:
    cm = colormaps[cmap]
    return ["#%02x%02x%02x" % tuple(int(c * 255) for c in cm(i / (n - 1))[:3]) for i in range(n)]


def colourise(values: np.ndarray, vmin: float, vmax: float, cmap: str, out: Path,
              nodata_rgba: tuple[int, int, int, int] = NODATA_RGBA) -> None:
    lut = (colormaps[cmap](np.linspace(0, 1, 256)) * 255).astype(np.uint8)
    finite = np.isfinite(values)
    idx = np.clip((np.nan_to_num(values) - vmin) / (vmax - vmin) * 255, 0, 255).astype(np.uint8)
    rgba = lut[idx]
    rgba[~finite] = nodata_rgba
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=90, method=6)


def truecolour(r: np.ndarray, g: np.ndarray, b: np.ndarray, out: Path) -> None:
    """Surface reflectance -> display RGB with a fixed stretch and gamma so
    periods look comparable."""
    rgb = np.stack([r, g, b], axis=-1)
    valid = np.all(np.isfinite(rgb), axis=-1)
    disp = np.clip(np.nan_to_num(rgb) / 0.3, 0, 1) ** (1 / 1.8)
    rgba = np.zeros(rgb.shape[:2] + (4,), dtype=np.uint8)
    rgba[..., :3] = (disp * 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=88, method=6)
