from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import pandas as pd
import io
from scipy import stats
import numpy as np
import os
import ruptures as rpt
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score
from anthropic import Anthropic

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_time(time_str):
    if not isinstance(time_str, str):
        return None, 'normal'

    time_str = time_str.strip()

    if time_str.startswith("DNF("):
        inner = time_str[4:-1]
        try:
            return float(inner), 'dnf'
        except ValueError:
            return None, 'dnf'

    if time_str.endswith("+"):
        try:
            return float(time_str[:-1]) + 2, 'plus2'
        except ValueError:
            return None, 'plus2'

    if ":" in time_str:
        parts = time_str.split(":")
        try:
            return int(parts[0]) * 60 + float(parts[1]), 'normal'
        except ValueError:
            return None, 'normal'

    try:
        return float(time_str), 'normal'
    except ValueError:
        return None, 'normal'

def compute_average(times, n):
    result = []
    for i in range(len(times)):
        if i < n - 1:
            result.append(None)
        else:
            window = times[i - n + 1 : i + 1]
            trimmed = sorted(window)[1:-1]
            result.append(round(sum(trimmed) / len(trimmed), 3))
    return result

def process_csv(contents):
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")), sep=";")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse CSV.")

    if "Time" not in df.columns:
        raise HTTPException(status_code=400, detail="CSV missing 'Time' column.")

    parsed = df["Time"].apply(parse_time)
    df["CleanedTime"] = parsed.apply(lambda x: x[0])
    df["Penalty"] = parsed.apply(lambda x: x[1])
    df = df.dropna(subset=["CleanedTime"])
    df["CleanedTime"] = df["CleanedTime"].astype(float)
    df["Scramble"] = df.get("Scramble", pd.Series([""] * len(df))).fillna("")
    df["Comment"] = df.get("Comment", pd.Series([""] * len(df))).fillna("")
    df["Date"] = df.get("Date", pd.Series([""] * len(df))).fillna("")

    times = df["CleanedTime"].tolist()
    ao5 = compute_average(times, 5)
    ao12 = compute_average(times, 12)

    solves = []
    for i, (_, row) in enumerate(df.iterrows()):
        solves.append({
            "solveNumber": i + 1,
            "time": round(row["CleanedTime"], 3),
            "scramble": row["Scramble"],
            "comment": row["Comment"],
            "date": row["Date"],
            "penalty": row["Penalty"],
            "ao5": ao5[i],
            "ao12": ao12[i],
        })

    return {
        "solves": solves,
        "stats": {
            "count": len(times),
            "mean": round(sum(times) / len(times), 3),
            "best": round(min(times), 3),
            "worst": round(max(times), 3),
        }
    }

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    return process_csv(contents)

@app.post("/hypothesis/one-sample/")
async def one_sample_test(times: List[float] = Body(...), target: float = 10.0):
    arr = np.array(times)
    t_stat, p_value = stats.ttest_1samp(arr, target)
    mean = arr.mean()
    std = arr.std(ddof=1)
    n = len(arr)
    ci = stats.t.interval(0.95, df=n - 1, loc=mean, scale=stats.sem(arr))

    is_significant = bool(p_value < 0.05)
    is_under = bool(mean < target)

    # Power analysis: how many solves needed to detect a difference of this size
    # at alpha = 0.05 (two-sided) with 80% power
    delta = abs(mean - target)
    required_n = None
    additional_solves = None
    if delta > 1e-9:
        z_alpha = stats.norm.ppf(0.975)
        z_power = stats.norm.ppf(0.80)
        required_n = int(np.ceil(((z_alpha + z_power) * std / delta) ** 2))
        additional_solves = max(0, required_n - n)

    if is_significant and is_under:
        interpretation = f"Your mean ({mean:.3f}s) is statistically significantly under {target}s."
    elif is_significant and not is_under:
        interpretation = f"Your mean ({mean:.3f}s) is statistically significantly over {target}s."
    else:
        interpretation = f"Not enough evidence to conclude your mean differs from {target}s."
        if additional_solves is not None and additional_solves > 0:
            interpretation += (
                f" To reliably detect a difference of this size (80% power), "
                f"you would need roughly {required_n} solves total — about {additional_solves} more."
            )

    return {
        "mean": float(round(mean, 3)),
        "t_statistic": float(round(t_stat, 4)),
        "p_value": float(round(p_value, 4)),
        "confidence_interval": [float(round(ci[0], 3)), float(round(ci[1], 3))],
        "is_significant": is_significant,
        "is_under": is_under,
        "required_n": required_n,
        "additional_solves": additional_solves,
        "interpretation": interpretation,
    }

@app.post("/hypothesis/outlier/")
async def outlier_test(times: List[float] = Body(...), time: float = 10.0):
    arr = np.array(times)

    # MLE fit of a lognormal distribution (solve times are right-skewed,
    # so a normal-based z-test is the wrong model)
    log_t = np.log(arr)
    mu = log_t.mean()
    sigma = log_t.std(ddof=1)

    percentile = float(stats.lognorm.cdf(time, s=sigma, scale=np.exp(mu)))
    p_value = float(2 * min(percentile, 1 - percentile))

    # Old-style z-score kept for comparison/education
    mean = arr.mean()
    std = arr.std(ddof=1)
    z_score = (time - mean) / std

    is_outlier = bool(p_value < 0.05)

    if is_outlier and time < mean:
        interpretation = (
            f"{time}s is unusually fast: under your fitted lognormal model, it sits at the "
            f"{percentile*100:.2f}th percentile of your solves."
        )
    elif is_outlier and time > mean:
        interpretation = (
            f"{time}s is unusually slow: under your fitted lognormal model, it sits at the "
            f"{percentile*100:.2f}th percentile of your solves."
        )
    else:
        interpretation = (
            f"{time}s is consistent with your normal performance "
            f"({percentile*100:.1f}th percentile under your fitted lognormal model)."
        )

    return {
        "input_time": float(time),
        "session_mean": float(round(mean, 3)),
        "session_std": float(round(std, 3)),
        "percentile": float(round(percentile * 100, 2)),
        "z_score": float(round(z_score, 4)),
        "p_value": float(round(p_value, 4)),
        "is_outlier": is_outlier,
        "interpretation": interpretation,
    }

@app.post("/analysis/distribution/")
async def distribution_fit(times: List[float] = Body(...), sub_x: Optional[float] = None):
    arr = np.array(times)
    n = len(arr)

    # MLE for lognormal: mu, sigma are the mean/std of log(times)
    log_t = np.log(arr)
    mu = log_t.mean()
    sigma = log_t.std(ddof=1)

    # Compare fit quality: lognormal vs normal (log-likelihoods)
    ll_lognorm = float(np.sum(stats.lognorm.logpdf(arr, s=sigma, scale=np.exp(mu))))
    norm_mean = arr.mean()
    norm_std = arr.std(ddof=1)
    ll_norm = float(np.sum(stats.norm.logpdf(arr, loc=norm_mean, scale=norm_std)))
    better_fit = "lognormal" if ll_lognorm > ll_norm else "normal"

    # Histogram + fitted curve (scaled to counts so they overlay)
    counts, edges = np.histogram(arr, bins=40)
    centers = (edges[:-1] + edges[1:]) / 2
    bin_width = float(edges[1] - edges[0])
    fitted_curve = stats.lognorm.pdf(centers, s=sigma, scale=np.exp(mu)) * n * bin_width

    result = {
        "n": n,
        "mu": float(round(mu, 4)),
        "sigma": float(round(sigma, 4)),
        "median": float(round(np.exp(mu), 3)),
        "log_likelihood_lognormal": round(ll_lognorm, 1),
        "log_likelihood_normal": round(ll_norm, 1),
        "better_fit": better_fit,
        "histogram": {
            "bin_centers": [float(round(c, 2)) for c in centers],
            "counts": [int(c) for c in counts],
            "fitted_curve": [float(round(f, 2)) for f in fitted_curve],
        },
        "interpretation": (
            f"A lognormal distribution was fit to your {n} solves via maximum likelihood "
            f"(mu={mu:.3f}, sigma={sigma:.3f}). The lognormal fits "
            f"{'better' if better_fit == 'lognormal' else 'worse'} than a normal distribution, "
            f"{'confirming' if better_fit == 'lognormal' else 'contradicting'} the expected "
            f"right-skew of solve times."
        ),
    }

    if sub_x is not None:
        model_prob = float(stats.lognorm.cdf(sub_x, s=sigma, scale=np.exp(mu)))
        empirical_prob = float(np.mean(arr < sub_x))
        result["sub_x"] = {
            "target": float(sub_x),
            "model_probability": float(round(model_prob * 100, 2)),
            "empirical_probability": float(round(empirical_prob * 100, 2)),
            "interpretation": (
                f"Under the fitted model, {model_prob*100:.1f}% of your solves are expected to be "
                f"under {sub_x}s (empirically: {empirical_prob*100:.1f}%)."
            ),
        }

    return result

@app.post("/analysis/trend/")
async def trend_analysis(times: List[float] = Body(...), target: Optional[float] = None):
    arr = np.array(times)
    n = len(arr)

    if n < 10:
        raise HTTPException(status_code=400, detail="Need at least 10 solves for trend analysis.")

    x = np.arange(1, n + 1)
    y = np.log(arr)  # regress on log(time): multiplicative improvement model

    reg = stats.linregress(x, y)
    slope, intercept = reg.slope, reg.intercept

    # Percent improvement per 100 solves
    pct_per_100 = (np.exp(slope * 100) - 1) * 100

    # Sampled trend curve with 95% CI band for the mean prediction
    resid = y - (intercept + slope * x)
    s = np.sqrt(np.sum(resid ** 2) / (n - 2))
    sxx = np.sum((x - x.mean()) ** 2)
    idx = np.linspace(1, n, num=min(200, n))
    pred_log = intercept + slope * idx
    se_fit = s * np.sqrt(1 / n + (idx - x.mean()) ** 2 / sxx)
    t_crit = stats.t.ppf(0.975, n - 2)

    trend = np.exp(pred_log)
    upper = np.exp(pred_log + t_crit * se_fit)
    lower = np.exp(pred_log - t_crit * se_fit)

    is_improving = bool(slope < 0 and reg.pvalue < 0.05)

    forecast = None
    if target is not None and slope < 0:
        i_target = (np.log(target) - intercept) / slope
        current_pred = float(np.exp(intercept + slope * n))
        if i_target <= n:
            forecast = {
                "reached": True,
                "interpretation": (
                    f"Your fitted trend predicts your typical solve is already at or under "
                    f"{target}s (current trend value: {current_pred:.2f}s)."
                ),
            }
        else:
            solves_needed = int(np.ceil(i_target - n))
            forecast = {
                "reached": False,
                "target_solve_number": int(np.ceil(i_target)),
                "solves_needed": solves_needed,
                "interpretation": (
                    f"At your current improvement rate, you are projected to reach {target}s "
                    f"around solve #{int(np.ceil(i_target))} — roughly {solves_needed} more solves. "
                    f"This is an extrapolation; improvement usually slows as you get faster."
                ),
            }
    elif target is not None:
        forecast = {
            "reached": False,
            "interpretation": "Your trend is flat or worsening, so no forecast can be made for this target.",
        }

    if is_improving:
        trend_interp = (
            f"You are improving: solve times decrease by {abs(pct_per_100):.1f}% per 100 solves "
            f"(p={reg.pvalue:.4f}, statistically significant)."
        )
    elif slope < 0:
        trend_interp = (
            f"Your times trend slightly downward ({abs(pct_per_100):.1f}% per 100 solves) "
            f"but the trend is not statistically significant (p={reg.pvalue:.4f})."
        )
    else:
        trend_interp = (
            f"Your times trend slightly upward ({pct_per_100:.1f}% per 100 solves, "
            f"p={reg.pvalue:.4f})."
        )

    return {
        "slope": float(round(slope, 6)),
        "pct_change_per_100": float(round(pct_per_100, 2)),
        "r_squared": float(round(reg.rvalue ** 2, 4)),
        "p_value": float(round(reg.pvalue, 6)),
        "is_improving": is_improving,
        "curve": {
            "x": [int(round(i)) for i in idx],
            "trend": [float(round(t, 3)) for t in trend],
            "upper": [float(round(u, 3)) for u in upper],
            "lower": [float(round(l, 3)) for l in lower],
        },
        "forecast": forecast,
        "interpretation": trend_interp,
    }

@app.post("/analysis/changepoints/")
async def changepoint_detection(times: List[float] = Body(...)):
    arr = np.array(times, dtype=float)
    n = len(arr)
    if n < 50:
        raise HTTPException(status_code=400, detail="Need at least 50 solves for changepoint detection.")

    algo = rpt.Pelt(model="l2", min_size=max(20, n // 50)).fit(arr)
    penalty = 3 * np.log(n) * np.var(arr)
    breakpoints = algo.predict(pen=penalty)

    segments = []
    start = 0
    for end in breakpoints:
        seg = arr[start:end]
        segments.append({
            "start_solve": int(start + 1),
            "end_solve": int(end),
            "mean": float(round(seg.mean(), 3)),
            "count": int(end - start),
        })
        start = end

    parts = []
    for i, seg in enumerate(segments):
        if i == 0:
            parts.append(f"Solves {seg['start_solve']}–{seg['end_solve']}: averaging {seg['mean']}s.")
        else:
            prev = segments[i - 1]["mean"]
            change = (seg["mean"] - prev) / prev * 100
            direction = "faster" if change < 0 else "slower"
            parts.append(
                f"Around solve {seg['start_solve']}, your performance shifted: "
                f"{seg['mean']}s average, {abs(change):.1f}% {direction} than the previous phase."
            )
    interpretation = " ".join(parts)

    return {
        "n_segments": len(segments),
        "segments": segments,
        "interpretation": interpretation,
    }

@app.post("/analysis/scramble-model/")
async def scramble_model(solves: List[dict] = Body(...)):
    data = [(s["scramble"], s["time"]) for s in solves if s.get("scramble")]
    if len(data) < 100:
        raise HTTPException(status_code=400, detail="Need at least 100 solves with scrambles.")

    feature_names = [
        "n_moves", "n_double_turns", "n_prime_moves", "n_wide_moves",
        "R_count", "L_count", "U_count", "D_count", "F_count", "B_count",
        "axis_changes",
    ]
    AXIS = {"R": 0, "L": 0, "U": 1, "D": 1, "F": 2, "B": 2}

    X, y = [], []
    for scramble, time in data:
        tokens = scramble.split()
        faces = [t[0].upper() for t in tokens if t and t[0].upper() in AXIS]
        axis_changes = sum(
            1 for i in range(1, len(faces)) if AXIS[faces[i]] != AXIS[faces[i - 1]]
        )
        row = [
            len(tokens),
            sum(1 for t in tokens if "2" in t),
            sum(1 for t in tokens if "'" in t),
            sum(1 for t in tokens if "w" in t.lower()),
            faces.count("R"), faces.count("L"), faces.count("U"),
            faces.count("D"), faces.count("F"), faces.count("B"),
            axis_changes,
        ]
        X.append(row)
        y.append(time)

    X = np.array(X, dtype=float)
    y = np.array(y, dtype=float)

    ridge_r2 = cross_val_score(Ridge(alpha=1.0), X, y, cv=5, scoring="r2")
    rf_r2 = cross_val_score(
        RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42, n_jobs=-1),
        X, y, cv=5, scoring="r2",
    )

    rf = RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42, n_jobs=-1).fit(X, y)
    importances = sorted(
        zip(feature_names, rf.feature_importances_), key=lambda t: -t[1]
    )[:5]

    best_r2 = float(max(ridge_r2.mean(), rf_r2.mean()))

    if best_r2 < 0.02:
        interpretation = (
            f"Scramble features explain essentially none of your solve time variance "
            f"(best cross-validated R² = {best_r2:.4f}). This is a meaningful negative result: "
            f"your fast solves are not explained by 'easy scrambles' — at least not by surface "
            f"features like move counts. Difficulty likely lives in solver-specific things "
            f"(cross solutions, lookahead) that notation features can't capture."
        )
    else:
        interpretation = (
            f"Scramble features explain {best_r2*100:.1f}% of solve time variance "
            f"(cross-validated R²). There is weak but real signal — check the top features."
        )

    return {
        "n_solves": len(y),
        "ridge_cv_r2": float(round(ridge_r2.mean(), 4)),
        "random_forest_cv_r2": float(round(rf_r2.mean(), 4)),
        "top_features": [{"name": n_, "importance": float(round(i, 4))} for n_, i in importances],
        "interpretation": interpretation,
    }

@app.post("/analysis/insights/")
async def ai_insights(payload: dict = Body(...)):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not set on the server.")

    times = np.array(payload["times"])
    penalties = payload.get("penalties", [])
    name = payload.get("name", "session")
    n = len(times)

    half = n // 2
    x = np.arange(1, n + 1)
    reg = stats.linregress(x, np.log(times))
    pct_per_100 = (np.exp(reg.slope * 100) - 1) * 100

    summary = {
        "session_name": name,
        "solve_count": n,
        "mean": round(float(times.mean()), 3),
        "median": round(float(np.median(times)), 3),
        "std_dev": round(float(times.std(ddof=1)), 3),
        "best": round(float(times.min()), 3),
        "worst": round(float(times.max()), 3),
        "first_half_mean": round(float(times[:half].mean()), 3),
        "second_half_mean": round(float(times[half:].mean()), 3),
        "trend_pct_per_100_solves": round(float(pct_per_100), 2),
        "trend_p_value": round(float(reg.pvalue), 5),
        "plus2_rate_pct": round(100 * penalties.count("plus2") / n, 2) if penalties else None,
        "dnf_count_excluded": penalties.count("dnf") if penalties else None,
        "consistency_cv_pct": round(float(times.std(ddof=1) / times.mean() * 100), 1),
    }

    prompt = (
        "You are a speedcubing coach analyzing a cuber's session statistics. "
        "Write a short, specific, encouraging-but-honest coaching summary (3 short paragraphs max). "
        "Reference the actual numbers. Cover: overall performance and trend, consistency, "
        "and one concrete suggestion. Do not use bullet points or headers, just prose.\n\n"
        f"Session statistics:\n{summary}"
    )

    client = Anthropic()
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"insights": msg.content[0].text, "summary": summary}