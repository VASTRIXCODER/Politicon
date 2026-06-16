"""
predict.py  —  EXPERIMENTAL next-bar direction probability
==========================================================

A small, **dependency-free** logistic-regression model (pure NumPy) that
estimates the probability that the NEXT bar closes higher, from simple technical
features of a ticker's own recent history.

⚠️  IMPORTANT — read this:
  * This is a **separate, experimental, opt-in** signal. It does NOT feed into
    or change the HP Analytics strategy (a faithful Pine-Script port).
  * It is a rough statistical read for **context only** — not advice, and very
    easily overfit. A holdout accuracy near the base rate (~50% on a coin-flip
    market) is expected and honest.
  * Every public function returns a dict and never raises.

Enable/disable with ``PREDICT_ENABLED`` (default on; clearly labelled in the UI).
"""

from __future__ import annotations

from typing import Dict

import numpy as np


def _sma(a: np.ndarray, w: int) -> np.ndarray:
    out = a.astype(float).copy()
    if w <= 1 or len(a) < w:
        return out
    cs = np.cumsum(np.insert(a, 0, 0.0))
    out[w - 1:] = (cs[w:] - cs[:-w]) / w
    return out


def _rollstd(a: np.ndarray, w: int) -> np.ndarray:
    out = np.zeros(len(a), dtype=float)
    for i in range(len(a)):
        lo = max(0, i - w + 1)
        out[i] = float(np.std(a[lo:i + 1]))
    return out


def _rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    n = len(closes)
    out = np.full(n, 50.0)
    if n < period + 1:
        return out
    d = np.diff(closes)
    up = np.clip(d, 0, None)
    dn = -np.clip(d, None, 0)
    ru = up[:period].mean()
    rd = dn[:period].mean()
    for i in range(period, n):
        if i > period:
            ru = (ru * (period - 1) + up[i - 1]) / period
            rd = (rd * (period - 1) + dn[i - 1]) / period
        rs = ru / rd if rd else 0.0
        out[i] = 100.0 - 100.0 / (1.0 + rs)
    return out


def _features(df) -> np.ndarray:
    c = df["close"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)
    n = len(c)
    ret1 = np.zeros(n); ret1[1:] = c[1:] / c[:-1] - 1.0
    ret5 = np.zeros(n); ret5[5:] = c[5:] / c[:-5] - 1.0
    ret10 = np.zeros(n); ret10[10:] = c[10:] / c[:-10] - 1.0
    sma20 = _sma(c, 20)
    dist = (c - sma20) / np.where(sma20 == 0, 1, sma20)
    vol = _rollstd(ret1, 10)
    rsi = _rsi(c, 14) / 100.0
    vsma = _sma(v, 20)
    volr = np.clip(v / np.where(vsma == 0, 1, vsma), 0, 5)
    return np.column_stack([ret1, ret5, ret10, dist, vol, rsi, volr])


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def _train_logreg(X: np.ndarray, y: np.ndarray, iters: int = 400, lr: float = 0.2,
                  l2: float = 1e-3):
    mu = X.mean(0)
    sd = X.std(0)
    sd[sd == 0] = 1.0
    Xs = np.column_stack([np.ones(len(X)), (X - mu) / sd])
    w = np.zeros(Xs.shape[1])
    for _ in range(iters):
        p = _sigmoid(Xs @ w)
        reg = np.r_[0.0, w[1:]] * l2
        w -= lr * (Xs.T @ (p - y) / len(y) + reg)
    return w, mu, sd


def predict_next_up(df, min_bars: int = 120) -> Dict:
    """Estimate P(next bar closes up) for the latest bar in ``df``.

    Returns a dict with prob_up, direction, confidence, an honest holdout
    accuracy and the base rate. ``{"error": ...}`` if there isn't enough data.
    """
    try:
        c = df["close"].to_numpy(dtype=float)
        if len(c) < min_bars:
            return {"error": f"need >= {min_bars} bars (have {len(c)})"}
        X = _features(df)
        y = np.zeros(len(c))
        y[:-1] = (c[1:] > c[:-1]).astype(float)

        s, e = 20, len(c) - 1          # drop warmup + the unlabeled last bar
        Xtr, ytr = X[s:e], y[s:e]
        split = max(1, int(len(Xtr) * 0.8))
        w, mu, sd = _train_logreg(Xtr[:split], ytr[:split])

        def prob(row: np.ndarray) -> float:
            xs = np.r_[1.0, (row - mu) / sd]
            return float(_sigmoid(xs @ w))

        if len(Xtr) - split > 0:
            preds = np.array([1 if prob(Xtr[i]) >= 0.5 else 0 for i in range(split, len(Xtr))])
            acc = float(np.mean(preds == ytr[split:]))
        else:
            acc = 0.0

        p_next = prob(X[-1])           # features of the latest bar -> next move
        return {
            "prob_up": round(p_next, 4),
            "direction": "up" if p_next >= 0.5 else "down",
            "confidence": round(abs(p_next - 0.5) * 200, 1),
            "holdout_accuracy": round(acc, 3),
            "base_rate_up": round(float(ytr.mean()), 3),
            "n_train": int(split),
            "experimental": True,
        }
    except Exception as exc:  # pragma: no cover - shape guard
        return {"error": f"prediction failed: {exc}"}
