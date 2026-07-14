from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from pydantic import BaseModel
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
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

WCA_API = "https://www.worldcubeassociation.org/api/v0"
WCA_HEADERS = {"User-Agent": "SolveStat/1.0 (local dev)"}

# Number of solves per average for each event
EVENT_SOLVE_COUNTS = {
    "333": 5, "222": 5, "444": 5, "555": 5, "666": 3, "777": 3,
    "333bf": 3, "333fm": 3, "333oh": 5, "clock": 5, "minx": 5,
    "pyram": 5, "skewb": 5, "sq1": 5, "444bf": 3, "555bf": 3,
    "333mbf": 3,
}

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
    if len(times) == 0:
        raise HTTPException(status_code=400, detail="No valid solves found.")
    arr = np.array(times)
    n = len(arr)
    percentile = float(np.mean(arr <= time))
    rng = np.random.default_rng()
    n_permutations = 10000
    draws = rng.choice(arr, size=n_permutations, replace=True)
    mean = float(arr.mean())
    if time <= mean:
        p_value = float(np.mean(draws <= time))
        direction = "fast"
    else:
        p_value = float(np.mean(draws >= time))
        direction = "slow"
    p_value_two = float(min(p_value * 2, 1.0))
    is_outlier = bool(p_value_two < 0.05)
    if is_outlier and direction == "fast":
        interpretation = (
            f"{time}s is unusually fast — only {p_value*100:.1f}% of random draws from your "
            f"solve history are this fast or faster (p={p_value_two:.4f}). "
            f"This is a statistically rare performance."
        )
    elif is_outlier and direction == "slow":
        interpretation = (
            f"{time}s is unusually slow — only {p_value*100:.1f}% of random draws from your "
            f"solve history are this slow or slower (p={p_value_two:.4f}). "
            f"This is a statistically rare performance."
        )
    else:
        interpretation = (
            f"{time}s is consistent with your normal performance. "
            f"{p_value*100:.1f}% of your solves are {'at or below' if direction == 'fast' else 'at or above'} this time "
            f"(p={p_value_two:.4f}). This could easily happen by chance."
        )
    return {
        "input_time": float(time),
        "session_mean": float(round(mean, 3)),
        "session_std": float(round(arr.std(ddof=1), 3)),
        "percentile": float(round(percentile * 100, 2)),
        "p_value": float(round(p_value_two, 4)),
        "one_tail_p": float(round(p_value, 4)),
        "is_outlier": is_outlier,
        "direction": direction,
        "n_permutations": n_permutations,
        "interpretation": interpretation,
    }

@app.post("/analysis/distribution/")
async def distribution_fit(times: List[float] = Body(...), sub_x: Optional[float] = None):
    arr = np.array(times)
    n = len(arr)
    log_t = np.log(arr)
    mu = log_t.mean()
    sigma = log_t.std(ddof=1)
    ll_lognorm = float(np.sum(stats.lognorm.logpdf(arr, s=sigma, scale=np.exp(mu))))
    norm_mean = arr.mean()
    norm_std = arr.std(ddof=1)
    ll_norm = float(np.sum(stats.norm.logpdf(arr, loc=norm_mean, scale=norm_std)))
    better_fit = "lognormal" if ll_lognorm > ll_norm else "normal"
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
    y = np.log(arr)
    reg = stats.linregress(x, y)
    slope, intercept = reg.slope, reg.intercept
    pct_per_100 = (np.exp(slope * 100) - 1) * 100
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
    return {
        "n_segments": len(segments),
        "segments": segments,
        "interpretation": " ".join(parts),
    }

@app.post("/analysis/scramble-model/")
async def scramble_model(solves: List[dict] = Body(...)):
    data = [(s["scramble"], s["time"]) for s in solves if s.get("scramble")]
    if len(data) < 100:
        raise HTTPException(status_code=400, detail="Need at least 100 solves with scrambles.")
    feature_names = [
        "n_moves", "n_double_turns", "n_prime_moves", "n_wide_moves",
        "R_count", "L_count", "U_count", "D_count", "F_count", "B_count", "axis_changes",
    ]
    AXIS = {"R": 0, "L": 0, "U": 1, "D": 1, "F": 2, "B": 2}
    X, y = [], []
    for scramble, time in data:
        tokens = scramble.split()
        faces = [t[0].upper() for t in tokens if t and t[0].upper() in AXIS]
        axis_changes = sum(1 for i in range(1, len(faces)) if AXIS[faces[i]] != AXIS[faces[i - 1]])
        row = [
            len(tokens), sum(1 for t in tokens if "2" in t), sum(1 for t in tokens if "'" in t),
            sum(1 for t in tokens if "w" in t.lower()), faces.count("R"), faces.count("L"),
            faces.count("U"), faces.count("D"), faces.count("F"), faces.count("B"), axis_changes,
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
    importances = sorted(zip(feature_names, rf.feature_importances_), key=lambda t: -t[1])[:5]
    best_r2 = float(max(ridge_r2.mean(), rf_r2.mean()))
    if best_r2 < 0.02:
        interpretation = (
            f"Scramble features explain essentially none of your solve time variance "
            f"(best cross-validated R² = {best_r2:.4f})."
        )
    else:
        interpretation = f"Scramble features explain {best_r2*100:.1f}% of solve time variance."
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
        "session_name": name, "solve_count": n,
        "mean": round(float(times.mean()), 3), "median": round(float(np.median(times)), 3),
        "std_dev": round(float(times.std(ddof=1)), 3), "best": round(float(times.min()), 3),
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
        model="claude-sonnet-4-6", max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"insights": msg.content[0].text, "summary": summary}

@app.post("/analysis/bootstrap/")
async def bootstrap_analysis(times: List[float] = Body(...), target: float = 10.0, n_resamples: int = 10000):
    arr = np.array(times)
    n = len(arr)
    empirical_rate = float(np.mean(arr < target))
    rng = np.random.default_rng()
    bootstrap_rates = []
    for _ in range(n_resamples):
        resample = rng.choice(arr, size=n, replace=True)
        bootstrap_rates.append(np.mean(resample < target))
    bootstrap_rates = np.array(bootstrap_rates)
    ci_low = float(np.percentile(bootstrap_rates, 2.5))
    ci_high = float(np.percentile(bootstrap_rates, 97.5))
    bootstrap_std = float(bootstrap_rates.std())
    if empirical_rate == 0:
        interpretation = f"None of your solves are under {target}s."
    else:
        interpretation = (
            f"You go sub-{target}s on {empirical_rate*100:.1f}% of solves "
            f"({int(empirical_rate * n)} out of {n}). "
            f"Based on {n_resamples:,} bootstrap resamples, your true sub-{target}s rate "
            f"is between {ci_low*100:.1f}% and {ci_high*100:.1f}% with 95% confidence."
        )
    return {
        "target": float(target),
        "n_solves": n,
        "empirical_rate": float(round(empirical_rate, 4)),
        "empirical_count": int(np.sum(arr < target)),
        "ci_low": float(round(ci_low, 4)),
        "ci_high": float(round(ci_high, 4)),
        "bootstrap_std": float(round(bootstrap_std, 4)),
        "interpretation": interpretation,
    }

class ABTestPayload(BaseModel):
    times_a: List[float]
    times_b: List[float]
    name_a: str = "Session A"
    name_b: str = "Session B"

@app.post("/analysis/ab-test/")
async def ab_test(payload: ABTestPayload):
    a = np.array(payload.times_a)
    b = np.array(payload.times_b)
    if len(a) < 2 or len(b) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 solves in each session.")
    mean_a = float(a.mean())
    mean_b = float(b.mean())
    std_a = float(a.std(ddof=1))
    std_b = float(b.std(ddof=1))
    n_a = len(a)
    n_b = len(b)
    t_stat, p_welch = stats.ttest_ind(a, b, equal_var=False)
    u_stat, p_mann = stats.mannwhitneyu(a, b, alternative='two-sided')
    pooled_std = np.sqrt((std_a ** 2 + std_b ** 2) / 2)
    cohens_d = float((mean_a - mean_b) / pooled_std) if pooled_std > 0 else 0.0
    abs_d = abs(cohens_d)
    if abs_d < 0.2: effect_label = "negligible"
    elif abs_d < 0.5: effect_label = "small"
    elif abs_d < 0.8: effect_label = "medium"
    else: effect_label = "large"
    rng = np.random.default_rng()
    n_resamples = 10000
    diffs = []
    for _ in range(n_resamples):
        resample_a = rng.choice(a, size=n_a, replace=True)
        resample_b = rng.choice(b, size=n_b, replace=True)
        diffs.append(resample_a.mean() - resample_b.mean())
    diffs = np.array(diffs)
    ci_low = float(np.percentile(diffs, 2.5))
    ci_high = float(np.percentile(diffs, 97.5))
    observed_diff = float(mean_a - mean_b)
    is_significant = bool(p_welch < 0.05)
    a_faster = mean_a < mean_b
    if is_significant:
        faster_name = payload.name_a if a_faster else payload.name_b
        slower_name = payload.name_b if a_faster else payload.name_a
        interpretation = (
            f"{faster_name} is statistically significantly faster than {slower_name} "
            f"(mean difference: {abs(observed_diff):.3f}s, p={p_welch:.4f}). "
            f"Effect size is {effect_label} (Cohen's d = {abs(cohens_d):.3f}). "
            f"95% bootstrap CI: [{ci_low:.3f}s, {ci_high:.3f}s]."
        )
    else:
        interpretation = (
            f"No statistically significant difference (p={p_welch:.4f}). "
            f"Observed difference of {abs(observed_diff):.3f}s could be due to chance. "
            f"Effect size is {effect_label} (Cohen's d = {abs(cohens_d):.3f})."
        )
    return {
        "name_a": payload.name_a, "name_b": payload.name_b,
        "mean_a": float(round(mean_a, 3)), "mean_b": float(round(mean_b, 3)),
        "std_a": float(round(std_a, 3)), "std_b": float(round(std_b, 3)),
        "n_a": n_a, "n_b": n_b,
        "observed_diff": float(round(observed_diff, 3)),
        "t_statistic": float(round(t_stat, 4)),
        "p_welch": float(round(p_welch, 4)),
        "p_mann_whitney": float(round(p_mann, 4)),
        "cohens_d": float(round(cohens_d, 4)),
        "effect_label": effect_label,
        "ci_low": float(round(ci_low, 3)),
        "ci_high": float(round(ci_high, 3)),
        "is_significant": is_significant,
        "a_faster": bool(a_faster),
        "interpretation": interpretation,
    }


# ─── WCA endpoints ────────────────────────────────────────────────────────────

@app.get("/wca/competitions/search")
async def search_competitions(query: Optional[str] = None):
    """Search WCA competitions by name, or return recent past competitions if no query."""
    from datetime import date
    today = date.today().isoformat()

    async with httpx.AsyncClient(timeout=15) as client:
        if query and query.strip():
            # Search by name, past only, most recent first
            params = {
                "q": query.strip(),
                "per_page": 20,
                "end": today,
                "sort": "-start_date",
            }
            resp = await client.get(f"{WCA_API}/competitions", params=params, headers=WCA_HEADERS)
        else:
            # No query — return recent past competitions
            params = {
                "per_page": 20,
                "end": today,
                "sort": "-start_date",
            }
            resp = await client.get(f"{WCA_API}/competitions", params=params, headers=WCA_HEADERS)

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="WCA API error.")

    comps = resp.json()
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "city": c.get("city", ""),
            "country": c.get("country_iso2", ""),
            "start_date": c.get("start_date", ""),
            "end_date": c.get("end_date", ""),
            "events": c.get("event_ids", []),
            "competitor_count": c.get("competitor_count"),
        }
        for c in comps
    ]


@app.get("/wca/competitions/{comp_id}/results/{event_id}")
async def get_competition_results(comp_id: str, event_id: str, round_id: Optional[str] = None):
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{WCA_API}/competitions/{comp_id}/results",
            headers=WCA_HEADERS
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Competition not found.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="WCA API error.")

    all_results = resp.json()

    # Handle both list format and dict format
    if isinstance(all_results, dict):
        results_list = all_results.get("results", all_results.get("data", []))
    else:
        results_list = all_results

    event_results = [r for r in results_list if r.get("event_id") == event_id]
    if not event_results:
        # Try to find what events are available
        available = list(set(r.get("event_id", "") for r in results_list if r.get("event_id")))
        raise HTTPException(
            status_code=404,
            detail=f"No results for event '{event_id}' at this competition. Available events: {', '.join(sorted(available))}"
        )

    # Get round type — try multiple field names
    def get_round_type(r):
        return r.get("round_type_id") or r.get("roundTypeId") or r.get("round_type") or r.get("round") or "f"

    round_order = {"1": 1, "2": 2, "3": 3, "c": 4, "f": 5}
    rounds_found = {}
    for r in event_results:
        rt = get_round_type(r)
        rounds_found[rt] = rounds_found.get(rt, 0) + 1

    sorted_rounds = sorted(rounds_found.keys(), key=lambda x: round_order.get(x, 99))

    round_labels = {
        "1": "Round 1", "2": "Round 2", "3": "Round 3",
        "c": "Combined Final", "f": "Final"
    }

    rounds_info = [
        {
            "id": rt,
            "label": round_labels.get(rt, f"Round {rt}"),
            "competitor_count": rounds_found[rt],
        }
        for rt in sorted_rounds
    ]

    if round_id and round_id in rounds_found:
        selected_round = round_id
    else:
        preferred = ["f", "c", "3", "2", "1"]
        selected_round = next((rt for rt in preferred if rt in rounds_found), sorted_rounds[-1])

    round_results = [r for r in event_results if get_round_type(r) == selected_round]

    selected_idx = sorted_rounds.index(selected_round)
    next_round_count = None
    if selected_idx < len(sorted_rounds) - 1:
        next_round = sorted_rounds[selected_idx + 1]
        next_round_count = rounds_found[next_round]

    competitors = []
    for r in round_results:
        avg_cs = r.get("average", -1)
        best_cs = r.get("best", -1)
        # Handle None values
        if avg_cs is None: avg_cs = -1
        if best_cs is None: best_cs = -1
        if avg_cs > 0:
            avg_s = round(avg_cs / 100, 3)
        elif best_cs > 0:
            avg_s = round(best_cs / 100, 3)
        else:
            continue

        competitors.append({
            "name": r.get("name", "Unknown"),
            "wca_id": r.get("wca_id", ""),
            "country": r.get("country_iso2", ""),
            "average": avg_s,
            "best": round(best_cs / 100, 3) if best_cs > 0 else None,
            "position": r.get("pos", 0),
        })

    competitors.sort(key=lambda x: x["average"])

    return {
        "competition_id": comp_id,
        "event_id": event_id,
        "round": selected_round,
        "rounds": rounds_info,
        "next_round_count": next_round_count,
        "is_final": selected_round in ["f", "c"] or selected_idx == len(sorted_rounds) - 1,
        "competitor_count": len(competitors),
        "competitors": competitors,
    }

class WCASimPayload(BaseModel):
    times: List[float]
    competitor_averages: List[float]
    n_simulations: int = 10000
    solve_count: int = 5
    next_round_count: Optional[int] = None

@app.post("/wca/simulate")
async def simulate_placement(payload: WCASimPayload):
    """Monte Carlo simulation: sample averages from user's distribution and rank against field."""
    arr = np.array(payload.times)
    competitor_avgs = np.array(sorted(payload.competitor_averages))
    n_competitors = len(competitor_avgs)
    solve_count = payload.solve_count
    drop = 1 if solve_count == 5 else 0

    if len(arr) < solve_count:
        raise HTTPException(status_code=400, detail=f"Need at least {solve_count} solves.")

    rng = np.random.default_rng()
    placements = []

    for _ in range(payload.n_simulations):
        draws = rng.choice(arr, size=solve_count, replace=True)
        if drop > 0:
            draws_sorted = np.sort(draws)
            trimmed = draws_sorted[drop:-drop]
            user_avg = float(trimmed.mean())
        else:
            user_avg = float(draws.mean())
        place = int(np.sum(competitor_avgs < user_avg)) + 1
        placements.append(place)

    placements = np.array(placements)
    median_place = int(np.median(placements))
    ci_low = int(np.percentile(placements, 2.5))
    ci_high = int(np.percentile(placements, 97.5))
    mean_place = float(placements.mean())
    percentile_in_field = float((n_competitors - median_place + 1) / n_competitors * 100)

    place_counts = {}
    for p in placements:
        place_counts[int(p)] = place_counts.get(int(p), 0) + 1

    top3_prob = float(np.mean(placements <= 3) * 100)
    top10_prob = float(np.mean(placements <= 10) * 100)
    top_half_prob = float(np.mean(placements <= n_competitors / 2) * 100)

    # Advancement probability
    advance_prob = None
    if payload.next_round_count is not None:
        advance_prob = float(np.mean(placements <= payload.next_round_count) * 100)

    if median_place == 1:
        interpretation = (
            f"You would likely WIN this round! "
            f"Median projected place: 1st out of {n_competitors} competitors "
            f"(95% CI: {ci_low}–{ci_high})."
        )
    elif median_place <= 3:
        interpretation = (
            f"You would likely podium. "
            f"Median projected place: {median_place} out of {n_competitors} "
            f"(95% CI: {ci_low}–{ci_high}). Top 3 probability: {top3_prob:.1f}%."
        )
    elif percentile_in_field >= 75:
        interpretation = (
            f"You would be in the top quarter. "
            f"Median projected place: {median_place} out of {n_competitors} "
            f"(95% CI: {ci_low}–{ci_high})."
        )
    else:
        interpretation = (
            f"Median projected place: {median_place} out of {n_competitors} competitors "
            f"(95% CI: {ci_low}–{ci_high}). "
            f"You'd beat approximately {100 - percentile_in_field:.0f}% of the field."
        )

    if advance_prob is not None:
        interpretation += f" Advancement probability to next round: {advance_prob:.1f}%."

    return {
        "n_competitors": n_competitors,
        "n_simulations": payload.n_simulations,
        "median_place": median_place,
        "mean_place": round(mean_place, 1),
        "ci_low": ci_low,
        "ci_high": ci_high,
        "top3_prob": round(top3_prob, 1),
        "top10_prob": round(top10_prob, 1),
        "top_half_prob": round(top_half_prob, 1),
        "advance_prob": round(advance_prob, 1) if advance_prob is not None else None,
        "percentile_in_field": round(percentile_in_field, 1),
        "placement_distribution": place_counts,
        "interpretation": interpretation,
    }

@app.get("/wca/profile/{wca_id}")
async def get_wca_profile(wca_id: str):
    """Fetch a WCA profile with personal bests and competition results."""
    async with httpx.AsyncClient(timeout=15) as client:
        person_resp = await client.get(f"{WCA_API}/persons/{wca_id}", headers=WCA_HEADERS)
    if person_resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"WCA ID '{wca_id}' not found.")
    if person_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="WCA API error.")
    data = person_resp.json()
    person = data.get("person", {})
    pbs = {}
    for pb in data.get("personal_records", {}).values():
        pass
    # personal_records is a dict keyed by event_id
    personal_records = data.get("personal_records", {})
    pbs = {}
    for event_id, records in personal_records.items():
        entry = {}
        if "single" in records:
            s = records["single"]
            entry["single"] = round(s["best"] / 100, 3)
            entry["single_world_rank"] = s.get("world_rank")
        if "average" in records:
            a = records["average"]
            entry["average"] = round(a["best"] / 100, 3)
            entry["average_world_rank"] = a.get("world_rank")
        if entry:
            pbs[event_id] = entry

    return {
        "wca_id": wca_id,
        "name": person.get("name", ""),
        "country": person.get("country_iso2", ""),
        "gender": person.get("gender", ""),
        "delegate_status": person.get("delegate_status"),
        "competitions_count": data.get("competition_count", 0),
        "personal_bests": pbs,
    }


@app.get("/wca/profile/{wca_id}/results/{event_id}")
async def get_person_event_results(wca_id: str, event_id: str):
    """Fetch all competition averages for a person in a specific event."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{WCA_API}/persons/{wca_id}/results",
            params={"event_id": event_id},
            headers=WCA_HEADERS
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Person or results not found.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="WCA API error.")

    results = resp.json()
    averages = []
    for r in results:
        avg_cs = r.get("average", -1)
        if avg_cs and avg_cs > 0:
            averages.append({
                "competition": r.get("competition_id", ""),
                "round": r.get("round_type_id", ""),
                "average": round(avg_cs / 100, 3),
                "best": round(r["best"] / 100, 3) if r.get("best", -1) > 0 else None,
            })

    averages.sort(key=lambda x: x["average"])
    return {
        "wca_id": wca_id,
        "event_id": event_id,
        "n_results": len(averages),
        "averages": averages,
        "best_average": averages[0]["average"] if averages else None,
        "mean_average": round(sum(r["average"] for r in averages) / len(averages), 3) if averages else None,
    }


class PBSimPayload(BaseModel):
    times: List[float]
    pb_single: float
    pb_average: Optional[float] = None
    solve_count: int = 5
    n_simulations: int = 10000

@app.post("/wca/simulate-pb")
async def simulate_pb(payload: PBSimPayload):
    """Simulate probability of breaking PB single and average."""
    arr = np.array(payload.times)
    rng = np.random.default_rng()
    solve_count = payload.solve_count
    drop = 1 if solve_count == 5 else 0

    # PB single probability
    pb_single_prob = float(np.mean(arr < payload.pb_single) * 100)

    # PB average probability (simulate ao5s)
    avg_pbs = []
    for _ in range(payload.n_simulations):
        draws = rng.choice(arr, size=solve_count, replace=True)
        if drop > 0:
            draws_sorted = np.sort(draws)
            trimmed = draws_sorted[drop:-drop]
            avg_pbs.append(float(trimmed.mean()))
        else:
            avg_pbs.append(float(draws.mean()))

    avg_pbs = np.array(avg_pbs)
    pb_avg_prob = None
    if payload.pb_average is not None:
        pb_avg_prob = float(np.mean(avg_pbs < payload.pb_average) * 100)

    current_mean = float(arr.mean())
    current_best = float(arr.min())
    gap_single = round(current_best - payload.pb_single, 3)
    gap_avg = round(current_mean - payload.pb_average, 3) if payload.pb_average else None

    if pb_single_prob > 50:
        single_interp = f"You have a {pb_single_prob:.1f}% chance of breaking your PB single ({payload.pb_single}s) on any given solve. Your current best training time is {current_best}s."
    elif pb_single_prob > 10:
        single_interp = f"You have a {pb_single_prob:.1f}% chance of breaking your PB single ({payload.pb_single}s) on any given solve. Your training best is {current_best}s — {abs(gap_single):.3f}s {'faster than' if gap_single < 0 else 'slower than'} your PB."
    else:
        single_interp = f"Your PB single of {payload.pb_single}s is currently rare in training — only {pb_single_prob:.1f}% of your solves are faster. Your training best is {current_best}s."

    return {
        "pb_single": payload.pb_single,
        "pb_average": payload.pb_average,
        "current_training_mean": round(current_mean, 3),
        "current_training_best": round(current_best, 3),
        "pb_single_prob": round(pb_single_prob, 2),
        "pb_average_prob": round(pb_avg_prob, 2) if pb_avg_prob is not None else None,
        "gap_single": gap_single,
        "gap_average": gap_avg,
        "n_simulations": payload.n_simulations,
        "single_interpretation": single_interp,
    }


class HeadToHeadPayload(BaseModel):
    your_times: List[float]
    their_comp_averages: List[float]
    their_name: str = "Opponent"
    solve_count: int = 5
    n_simulations: int = 10000

@app.post("/wca/head-to-head")
async def head_to_head(payload: HeadToHeadPayload):
    """Simulate head-to-head: your solve distribution vs their comp average distribution."""
    your_arr = np.array(payload.your_times)
    their_arr = np.array(payload.their_comp_averages)
    rng = np.random.default_rng()
    solve_count = payload.solve_count
    drop = 1 if solve_count == 5 else 0

    your_wins = 0
    your_avgs = []
    their_avgs = []

    for _ in range(payload.n_simulations):
        # Sample your average
        your_draws = rng.choice(your_arr, size=solve_count, replace=True)
        if drop > 0:
            your_draws_sorted = np.sort(your_draws)
            your_avg = float(your_draws_sorted[drop:-drop].mean())
        else:
            your_avg = float(your_draws.mean())

        # Sample their average from their comp history
        their_avg = float(rng.choice(their_arr))

        your_avgs.append(your_avg)
        their_avgs.append(their_avg)
        if your_avg < their_avg:
            your_wins += 1

    win_prob = float(your_wins / payload.n_simulations * 100)
    your_avg_mean = float(np.mean(your_avgs))
    their_avg_mean = float(np.mean(their_avgs))
    expected_diff = round(your_avg_mean - their_avg_mean, 3)

    if win_prob >= 75:
        tone = "good"
        interp = f"You would beat {payload.their_name} about {win_prob:.1f}% of the time. You're clearly the faster solver based on their competition history."
    elif win_prob >= 50:
        tone = "good"
        interp = f"You'd edge out {payload.their_name} {win_prob:.1f}% of the time — a slight advantage, but it's competitive."
    elif win_prob >= 25:
        tone = "warn"
        interp = f"You'd beat {payload.their_name} {win_prob:.1f}% of the time. They have the advantage, but you're in the same ballpark."
    else:
        tone = "warn"
        interp = f"{payload.their_name} would beat you about {100 - win_prob:.1f}% of the time based on their competition history. They're significantly faster."

    return {
        "your_win_probability": round(win_prob, 1),
        "their_win_probability": round(100 - win_prob, 1),
        "your_expected_average": round(your_avg_mean, 3),
        "their_expected_average": round(their_avg_mean, 3),
        "expected_diff": expected_diff,
        "n_simulations": payload.n_simulations,
        "their_n_comps": len(their_arr),
        "interpretation": interp,
        "tone": tone,
    }

class BootstrapAveragePayload(BaseModel):
    times: List[float]
    target: float
    solve_count: int = 5
    n_resamples: int = 10000

@app.post("/analysis/bootstrap-average/")
async def bootstrap_average(payload: BootstrapAveragePayload):
    arr = np.array(payload.times)
    n = len(arr)
    solve_count = payload.solve_count
    drop = 1 if solve_count == 5 else 0

    if len(arr) < solve_count:
        raise HTTPException(status_code=400, detail=f"Need at least {solve_count} solves.")

    rng = np.random.default_rng()
    simulated_avgs = []

    for _ in range(payload.n_resamples):
        draws = rng.choice(arr, size=solve_count, replace=True)
        if drop > 0:
            draws_sorted = np.sort(draws)
            trimmed = draws_sorted[drop:-drop]
            simulated_avgs.append(float(trimmed.mean()))
        else:
            simulated_avgs.append(float(draws.mean()))

    simulated_avgs = np.array(simulated_avgs)
    empirical_rate = float(np.mean(simulated_avgs < payload.target))
    ci_low = float(np.percentile(simulated_avgs, 2.5))
    ci_high = float(np.percentile(simulated_avgs, 97.5))
    bootstrap_std = float(simulated_avgs.std())

    ao_label = f"Ao{solve_count}"

    if empirical_rate == 0:
        interpretation = f"Based on your training, a sub-{payload.target}s {ao_label} is very unlikely with your current times."
    else:
        interpretation = (
            f"You get a sub-{payload.target}s {ao_label} in {empirical_rate*100:.1f}% of simulated averages "
            f"({int(empirical_rate * payload.n_resamples):,} out of {payload.n_resamples:,} trials). "
            f"Your simulated {ao_label} times range from {ci_low:.3f}s to {ci_high:.3f}s (95% CI)."
        )

    return {
        "target": payload.target,
        "solve_count": solve_count,
        "ao_label": ao_label,
        "n_resamples": payload.n_resamples,
        "empirical_rate": round(empirical_rate, 4),
        "empirical_count": int(np.sum(simulated_avgs < payload.target)),
        "ci_low": round(ci_low, 3),
        "ci_high": round(ci_high, 3),
        "bootstrap_std": round(bootstrap_std, 4),
        "mean_simulated_avg": round(float(simulated_avgs.mean()), 3),
        "interpretation": interpretation,
    }