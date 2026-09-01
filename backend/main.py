from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import pandas as pd
import io
import json
import re
from datetime import datetime, timedelta, timezone
from scipy import stats
import numpy as np
import ruptures as rpt
import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from auth import require_user, firebase_available
import db

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


def _cstimer_solve_time(raw):
    """csTimer stores solve[0] as [penalty, rawMilliseconds] (or a bare number in
    older exports). Returns (seconds, penalty_label) or (None, _) if unusable."""
    if isinstance(raw, list) and len(raw) >= 2:
        penalty, ms = raw[0], raw[1]
        try:
            t = float(ms) / 1000.0
        except (TypeError, ValueError):
            return None, "normal"
        if penalty == -1:
            return t, "dnf"
        if isinstance(penalty, (int, float)) and penalty > 0:
            return t + float(penalty) / 1000.0, "plus2"
        return t, "normal"
    try:
        return float(raw) / 1000.0, "normal"
    except (TypeError, ValueError):
        return None, "normal"


def _parse_cstimer_session(raw_solves, tz_offset_minutes=0):
    solves, times = [], []
    for item in raw_solves:
        if not isinstance(item, list) or not item:
            continue
        t, penalty = _cstimer_solve_time(item[0])
        if t is None or t <= 0:
            continue
        scramble = item[1] if len(item) > 1 and isinstance(item[1], str) else ""
        comment = item[2] if len(item) > 2 and isinstance(item[2], str) else ""
        date = ""
        if len(item) > 3 and isinstance(item[3], (int, float)) and item[3] > 0:
            dt = datetime.fromtimestamp(item[3], timezone.utc) - timedelta(minutes=tz_offset_minutes)
            date = dt.strftime("%Y-%m-%d %H:%M:%S")
        solves.append({
            "solveNumber": len(solves) + 1,
            "time": round(t, 3),
            "scramble": scramble,
            "comment": comment,
            "date": date,
            "penalty": penalty,
            "ao5": None,
            "ao12": None,
        })
        times.append(t)
    if not times:
        return None
    ao5 = compute_average(times, 5)
    ao12 = compute_average(times, 12)
    for j, s in enumerate(solves):
        s["ao5"], s["ao12"] = ao5[j], ao12[j]
    return {
        "solves": solves,
        "stats": {
            "count": len(times),
            "mean": round(sum(times) / len(times), 3),
            "best": round(min(times), 3),
            "worst": round(max(times), 3),
        },
    }


@app.post("/upload/cstimer/")
async def upload_cstimer(file: UploadFile = File(...), tz_offset_minutes: int = 0):
    """Parse a full csTimer export (JSON) — every session becomes its own tab."""
    raw = await file.read()
    try:
        blob = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Not a valid csTimer export (expected JSON).")
    if not isinstance(blob, dict):
        raise HTTPException(status_code=400, detail="Unexpected csTimer file structure.")

    names = {}
    sd = blob.get("properties", {}).get("sessionData")
    if isinstance(sd, str):
        try:
            sd = json.loads(sd)
        except Exception:
            sd = {}
    if isinstance(sd, dict):
        for k, v in sd.items():
            if isinstance(v, dict) and v.get("name"):
                names[str(k)] = v["name"]

    out = []
    for key, val in blob.items():
        if not key.startswith("session") or key == "sessionN":
            continue
        sid = key[len("session"):]
        if not sid.isdigit():
            continue
        raw_solves = val
        if isinstance(raw_solves, str):
            try:
                raw_solves = json.loads(raw_solves)
            except Exception:
                continue
        if not isinstance(raw_solves, list) or not raw_solves:
            continue
        parsed = _parse_cstimer_session(raw_solves, tz_offset_minutes)
        if parsed:
            out.append({"_sid": int(sid), "name": names.get(sid, f"Session {sid}"), **parsed})

    if not out:
        raise HTTPException(status_code=400, detail="No sessions with solves found in this file.")
    out.sort(key=lambda s: s.pop("_sid"))
    return {"sessions": out}

@app.post("/hypothesis/outlier/")
async def outlier_test(times: List[float] = Body(...), time: float = 10.0):
    if len(times) == 0:
        raise HTTPException(status_code=400, detail="No valid solves found.")
    arr = np.array(times, dtype=float)
    n = len(arr)
    mean = float(arr.mean())

    # Exact empirical tail probabilities from the solve history (no resampling —
    # the quantity is computable directly, and sampling would only add noise).
    p_le = float(np.mean(arr <= time))
    p_ge = float(np.mean(arr >= time))
    if time <= mean:
        one_tail_p = p_le
        direction = "fast"
    else:
        one_tail_p = p_ge
        direction = "slow"
    p_two = float(min(one_tail_p * 2, 1.0))
    is_outlier = bool(p_two < 0.05)
    percentile = float(np.mean(arr <= time))

    if is_outlier and direction == "fast":
        interpretation = (
            f"{time}s is unusually fast — only {one_tail_p*100:.1f}% of your solves are this fast "
            f"or faster (two-tailed p={p_two:.4f}). A statistically rare performance."
        )
    elif is_outlier and direction == "slow":
        interpretation = (
            f"{time}s is unusually slow — only {one_tail_p*100:.1f}% of your solves are this slow "
            f"or slower (two-tailed p={p_two:.4f}). A statistically rare performance."
        )
    else:
        interpretation = (
            f"{time}s is consistent with your normal performance. "
            f"{one_tail_p*100:.1f}% of your solves are {'at or below' if direction == 'fast' else 'at or above'} this time "
            f"(two-tailed p={p_two:.4f}). This could easily happen by chance."
        )
    return {
        "input_time": float(time),
        "session_mean": float(round(mean, 3)),
        "session_std": float(round(arr.std(ddof=1), 3)),
        "percentile": float(round(percentile * 100, 2)),
        "p_value": float(round(p_two, 4)),
        "one_tail_p": float(round(one_tail_p, 4)),
        "is_outlier": is_outlier,
        "direction": direction,
        "n_solves": n,
        "interpretation": interpretation,
    }

@app.post("/analysis/changepoints/")
async def changepoint_detection(times: List[float] = Body(...)):
    arr = np.array(times, dtype=float)
    n = len(arr)
    if n < 50:
        raise HTTPException(status_code=400, detail="Need at least 50 solves for changepoint detection.")
    algo = rpt.Pelt(model="l2", min_size=max(20, n // 50)).fit(arr)
    # Estimate the solve-to-solve noise variance from successive differences
    # (robust to the level shifts we're trying to detect, unlike total variance).
    diffs = np.diff(arr)
    noise_var = float(np.median(np.abs(diffs)) ** 2 / (2 * 0.6745 ** 2)) if len(diffs) else float(np.var(arr))
    if noise_var <= 0:
        noise_var = float(np.var(arr)) or 1e-6
    # BIC-style penalty: one added parameter per changepoint.
    penalty = 2 * np.log(n) * noise_var
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

@app.post("/analysis/bootstrap/")
async def bootstrap_analysis(times: List[float] = Body(...), target: float = 10.0):
    arr = np.array(times, dtype=float)
    n = len(arr)
    if n == 0:
        raise HTTPException(status_code=400, detail="No valid solves found.")
    k = int(np.sum(arr < target))
    p = k / n

    # Wilson score interval for the proportion. Unlike the percentile bootstrap it
    # stays sensible at the boundary — with 0 hits it still reports an upper bound
    # instead of collapsing to [0%, 0%].
    z = 1.959963984540054  # standard normal 97.5th percentile
    denom = 1 + z ** 2 / n
    centre = (p + z ** 2 / (2 * n)) / denom
    half = (z / denom) * np.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2))
    ci_low = float(max(0.0, centre - half))
    ci_high = float(min(1.0, centre + half))
    se = float(np.sqrt(p * (1 - p) / n))

    if k == 0:
        interpretation = (
            f"None of your {n} solves are under {target}s. With 0 hits the true rate isn't "
            f"exactly zero — it's below {ci_high*100:.1f}% with 95% confidence (Wilson interval)."
        )
    else:
        interpretation = (
            f"You go sub-{target}s on {p*100:.1f}% of solves ({k} out of {n}). "
            f"95% confidence interval (Wilson score): {ci_low*100:.1f}% to {ci_high*100:.1f}%."
        )
    return {
        "target": float(target),
        "n_solves": n,
        "empirical_rate": float(round(p, 4)),
        "empirical_count": k,
        "ci_low": float(round(ci_low, 4)),
        "ci_high": float(round(ci_high, 4)),
        "bootstrap_std": float(round(se, 4)),
        "ci_method": "wilson",
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
    # Degrees-of-freedom-weighted pooled SD (correct when the two sessions differ
    # in size — the simple average of variances is only right when n_a == n_b).
    pooled_std = float(np.sqrt(
        ((n_a - 1) * std_a ** 2 + (n_b - 1) * std_b ** 2) / (n_a + n_b - 2)
    )) if (n_a + n_b - 2) > 0 else 0.0
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
async def search_competitions(query: Optional[str] = None, upcoming: bool = False):
    """Search WCA competitions by name. Defaults to recent past competitions;
    pass upcoming=true for future competitions (soonest first)."""
    from datetime import date
    today = date.today().isoformat()

    params = {"per_page": 25}
    if upcoming:
        params["start"] = today
        params["sort"] = "start_date"
    else:
        params["end"] = today
        params["sort"] = "-start_date"
    if query and query.strip():
        params["q"] = query.strip()

    async with httpx.AsyncClient(timeout=15) as client:
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


@app.get("/wca/competitions/{comp_id}/psych-sheet/{event_id}")
async def get_psych_sheet(comp_id: str, event_id: str):
    """Ranked psych sheet for an upcoming competition, built from the public WCIF.

    Ranks accepted registrants by their lifetime PB average for the event
    (falling back to PB single when they have no average PB yet).
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{WCA_API}/competitions/{comp_id}/wcif/public", headers=WCA_HEADERS
        )
    if resp.status_code in (403, 404):
        raise HTTPException(
            status_code=404,
            detail="This competition hasn't published its registration list yet.",
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="WCA API error.")

    wcif = resp.json()
    event_ids = [e["id"] for e in wcif.get("events", [])]
    if event_id not in event_ids:
        raise HTTPException(
            status_code=404,
            detail=f"This competition doesn't hold that event. Events: {', '.join(event_ids)}",
        )

    ranked = []
    unranked = 0
    for p in wcif.get("persons", []):
        reg = p.get("registration") or {}
        if reg.get("status") != "accepted":
            continue
        if event_id not in (reg.get("eventIds") or []):
            continue
        pbs = p.get("personalBests", [])
        avg = next(
            (b["best"] for b in pbs if b["eventId"] == event_id and b["type"] == "average"),
            None,
        )
        single = next(
            (b["best"] for b in pbs if b["eventId"] == event_id and b["type"] == "single"),
            None,
        )
        result_cs = avg if (avg and avg > 0) else single
        if not result_cs or result_cs <= 0:
            unranked += 1
            continue
        ranked.append({
            "name": p.get("name", "Unknown"),
            "wca_id": p.get("wcaId") or "",
            "country": p.get("countryIso2", ""),
            "average": round(result_cs / 100, 3),
            "best": round(single / 100, 3) if single and single > 0 else None,
            "has_average": bool(avg and avg > 0),
        })

    ranked.sort(key=lambda x: x["average"])
    n_field = len(ranked)

    rounds = []
    next_round_count = None
    for e in wcif.get("events", []):
        if e["id"] != event_id:
            continue
        rlist = e.get("rounds", [])
        for i, r in enumerate(rlist):
            last = i == len(rlist) - 1
            rounds.append({
                "id": r.get("id", f"{event_id}-r{i + 1}"),
                "label": "Final" if (last and len(rlist) > 1) else f"Round {i + 1}",
                "competitor_count": n_field if i == 0 else None,
            })
        if len(rlist) >= 2:
            adv = rlist[0].get("advancementCondition") or {}
            if adv.get("type") == "ranking":
                next_round_count = min(int(adv["level"]), n_field)
            elif adv.get("type") == "percent" and int(adv["level"]) < 100:
                next_round_count = max(1, int(n_field * int(adv["level"]) / 100))
        break

    return {
        "competition_id": comp_id,
        "event_id": event_id,
        "name": wcif.get("name", comp_id),
        "round": rounds[0]["id"] if rounds else f"{event_id}-r1",
        "rounds": rounds,
        "next_round_count": next_round_count,
        "is_final": len(rounds) <= 1,
        "is_psych_sheet": True,
        "competitor_count": n_field,
        "unranked_count": unranked,
        "solve_count": EVENT_SOLVE_COUNTS.get(event_id, 5),
        "competitors": ranked,
    }


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
    # Per-trial coefficient of variation applied to each competitor's average, so
    # opponents aren't treated as fixed points (used for psych-sheet fields where
    # the listed number is a lifetime PB, not what they'll actually average).
    opponent_cv: float = 0.0

@app.post("/wca/simulate")
async def simulate_placement(payload: WCASimPayload):
    """Monte Carlo simulation: sample averages from user's distribution and rank against field."""
    arr = np.array(payload.times)
    competitor_avgs = np.array(sorted(payload.competitor_averages), dtype=float)
    n_competitors = len(competitor_avgs)
    solve_count = payload.solve_count
    drop = 1 if solve_count == 5 else 0

    if len(arr) < solve_count:
        raise HTTPException(status_code=400, detail=f"Need at least {solve_count} solves.")

    cv = float(min(max(payload.opponent_cv, 0.0), 0.5))
    # lognormal sigma that yields the requested CV; mean offset keeps E[multiplier] = 1
    opp_sigma = float(np.sqrt(np.log(1 + cv ** 2))) if cv > 0 else 0.0

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
        if opp_sigma > 0:
            noise = rng.lognormal(mean=-0.5 * opp_sigma ** 2, sigma=opp_sigma, size=n_competitors)
            field = competitor_avgs * noise
            place = int(np.sum(field < user_avg)) + 1
        else:
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

    if cv > 0:
        interpretation += (
            f" Each competitor's result is varied ±{cv * 100:.0f}% per trial to reflect "
            f"day-to-day form rather than treating their listed average as fixed."
        )

    return {
        "n_competitors": n_competitors,
        "n_simulations": payload.n_simulations,
        "opponent_cv": cv,
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


# ─── Accounts + cloud storage (Firebase Auth + MongoDB Atlas) ─────────────────

def _require_db():
    if not db.db_available():
        raise HTTPException(status_code=503, detail="Database is not configured on the server.")


@app.get("/config")
async def config_status():
    """Lets the frontend know whether cloud features are available."""
    return {"auth": firebase_available(), "db": db.db_available()}


@app.get("/me")
async def get_me(user: dict = Depends(require_user)):
    _require_db()
    record = db.get_or_create_user(user["uid"], user.get("email", ""), user.get("name", ""))
    totals = db.user_totals(user["uid"])
    return {
        "uid": record["uid"],
        "email": record.get("email", ""),
        "name": record.get("name", ""),
        "wca_id": record.get("wcaId", ""),
        "handle": record.get("handle") or "",
        "public_name": record.get("publicName", ""),
        "provider": user.get("provider", ""),
        "picture": user.get("picture", ""),
        "created_at": record["createdAt"].isoformat() if record.get("createdAt") else None,
        "session_count": totals["session_count"],
        "total_solves": totals["total_solves"],
    }


class WcaIdPayload(BaseModel):
    wca_id: str


@app.put("/me/wca-id")
async def update_wca_id(payload: WcaIdPayload, user: dict = Depends(require_user)):
    _require_db()
    db.get_or_create_user(user["uid"], user.get("email", ""), user.get("name", ""))
    wca_id = payload.wca_id.strip().upper()
    record = db.set_wca_id(user["uid"], wca_id)
    return {"wca_id": record.get("wcaId", "")}


_HANDLE_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$")


class HandlePayload(BaseModel):
    handle: str
    public_name: Optional[str] = None


@app.put("/me/handle")
async def update_handle(payload: HandlePayload, user: dict = Depends(require_user)):
    _require_db()
    db.get_or_create_user(user["uid"], user.get("email", ""), user.get("name", ""))
    handle = payload.handle.strip().lower()
    if handle and not _HANDLE_RE.match(handle):
        raise HTTPException(
            status_code=400,
            detail="Handle must be 3–30 characters: lowercase letters, numbers, and hyphens.",
        )
    try:
        record = db.set_handle(user["uid"], handle, payload.public_name)
    except db.HandleTaken:
        raise HTTPException(status_code=409, detail="That handle is already taken.")
    return {"handle": record.get("handle") or "", "public_name": record.get("publicName", "")}


@app.get("/sessions")
async def get_sessions(user: dict = Depends(require_user)):
    _require_db()
    return db.list_sessions(user["uid"])


class SessionPayload(BaseModel):
    name: str
    solves: List[dict]
    stats: dict = {}


@app.post("/sessions")
async def post_session(payload: SessionPayload, user: dict = Depends(require_user)):
    _require_db()
    if not payload.solves:
        raise HTTPException(status_code=400, detail="Session has no solves.")
    db.get_or_create_user(user["uid"], user.get("email", ""), user.get("name", ""))
    return db.create_session(user["uid"], payload.name.strip() or "session", payload.solves, payload.stats)


class SessionUpdatePayload(BaseModel):
    name: Optional[str] = None
    is_public: Optional[bool] = None


@app.patch("/sessions/{session_id}")
async def patch_session(session_id: str, payload: SessionUpdatePayload, user: dict = Depends(require_user)):
    _require_db()
    name = payload.name.strip() or "session" if payload.name is not None else None
    result = db.update_session(user["uid"], session_id, name=name, is_public=payload.is_public)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return result


@app.get("/public/{handle}")
async def public_profile(handle: str):
    _require_db()
    profile = db.get_public_profile(handle)
    if profile is None:
        raise HTTPException(status_code=404, detail="No public profile found for that handle.")
    return profile


@app.delete("/sessions/{session_id}")
async def remove_session(session_id: str, user: dict = Depends(require_user)):
    _require_db()
    if not db.delete_session(user["uid"], session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"deleted": True}