from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import pandas as pd
import io
from scipy import stats
import numpy as np

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
    t_stat, p_value = stats.ttest_1samp(times, target)
    mean = np.mean(times)
    n = len(times)
    ci = stats.t.interval(0.95, df=n-1, loc=mean, scale=stats.sem(times))

    is_significant = bool(p_value < 0.05)
    is_under = bool(mean < target)

    if is_significant and is_under:
        interpretation = f"Your mean ({mean:.3f}s) is statistically significantly under {target}s."
    elif is_significant and not is_under:
        interpretation = f"Your mean ({mean:.3f}s) is statistically significantly over {target}s."
    else:
        interpretation = f"Not enough evidence to conclude your mean differs from {target}s."

    return {
        "mean": float(round(mean, 3)),
        "t_statistic": float(round(t_stat, 4)),
        "p_value": float(round(p_value, 4)),
        "confidence_interval": [float(round(ci[0], 3)), float(round(ci[1], 3))],
        "is_significant": is_significant,
        "is_under": is_under,
        "interpretation": interpretation,
    }

@app.post("/hypothesis/outlier/")
async def outlier_test(times: List[float] = Body(...), time: float = 10.0):
    mean = np.mean(times)
    std = np.std(times, ddof=1)
    z_score = (time - mean) / std
    p_value = 2 * (1 - stats.norm.cdf(abs(z_score)))

    is_outlier = bool(p_value < 0.05)

    if is_outlier and time < mean:
        interpretation = f"{time}s is unusually fast given your history (mean: {mean:.3f}s). Only {p_value*100:.2f}% chance of this occurring randomly."
    elif is_outlier and time > mean:
        interpretation = f"{time}s is unusually slow given your history (mean: {mean:.3f}s). Only {p_value*100:.2f}% chance of this occurring randomly."
    else:
        interpretation = f"{time}s is consistent with your normal performance (mean: {mean:.3f}s). {p_value*100:.2f}% chance of this occurring randomly."

    return {
        "input_time": float(time),
        "session_mean": float(round(mean, 3)),
        "session_std": float(round(std, 3)),
        "z_score": float(round(z_score, 4)),
        "p_value": float(round(p_value, 4)),
        "is_outlier": is_outlier,
        "interpretation": interpretation,
    }