"""Trend and difference tests used for every reported finding."""
import numpy as np
from scipy import stats

MIN_TREND_YEARS = 6


def trend(years: list[int], values: list[float | None]) -> dict | None:
    """Theil-Sen slope with a Mann-Kendall test (Kendall's tau of value vs time).

    Robust to outliers and makes no normality assumption. With ~12 annual
    points the test has low power: a non-significant result means "no
    detectable trend", not "no change".
    """
    pts = [(y, v) for y, v in zip(years, values) if v is not None and np.isfinite(v)]
    if len(pts) < MIN_TREND_YEARS:
        return None
    x = np.array([p[0] for p in pts], dtype=float)
    y = np.array([p[1] for p in pts], dtype=float)
    slope, intercept, lo, hi = stats.theilslopes(y, x, alpha=0.95)
    tau, p = stats.kendalltau(x, y)
    return {
        "n": len(pts),
        "slope_per_decade": round(float(slope) * 10, 4),
        "slope_ci95_per_decade": [round(float(lo) * 10, 4), round(float(hi) * 10, 4)],
        "intercept": float(intercept),
        "kendall_tau": round(float(tau), 3),
        "p_value": round(float(p), 4),
        "significant": bool(p < 0.05),
    }


def period_difference(a: list[float], b: list[float], n_perm: int = 20000, seed: int = 0) -> dict | None:
    """Two-sided permutation test on the difference of means (b - a).

    Inputs are scene-level values, so each observation date counts once.
    """
    a = np.array([v for v in a if v is not None and np.isfinite(v)], dtype=float)
    b = np.array([v for v in b if v is not None and np.isfinite(v)], dtype=float)
    if len(a) < 3 or len(b) < 3:
        return None
    obs = b.mean() - a.mean()
    pooled = np.concatenate([a, b])
    rng = np.random.default_rng(seed)
    count = 0
    for _ in range(n_perm):
        rng.shuffle(pooled)
        d = pooled[len(a):].mean() - pooled[: len(a)].mean()
        if abs(d) >= abs(obs) - 1e-12:
            count += 1
    p = (count + 1) / (n_perm + 1)
    boot = [
        rng.choice(b, len(b)).mean() - rng.choice(a, len(a)).mean() for _ in range(5000)
    ]
    return {
        "n_a": int(len(a)),
        "n_b": int(len(b)),
        "mean_a": round(float(a.mean()), 3),
        "mean_b": round(float(b.mean()), 3),
        "difference": round(float(obs), 3),
        "ci95": [round(float(np.percentile(boot, 2.5)), 3), round(float(np.percentile(boot, 97.5)), 3)],
        "p_value": round(float(p), 4),
        "significant": bool(p < 0.05),
    }


def correlation(x: np.ndarray, y: np.ndarray) -> dict:
    """Pearson and Spearman r. No p-value: neighbouring pixels are not
    independent, so a naive p-value would be badly overconfident."""
    return {
        "pearson_r": round(float(stats.pearsonr(x, y)[0]), 3),
        "spearman_r": round(float(stats.spearmanr(x, y)[0]), 3),
        "n_pixels": int(len(x)),
    }
