from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io

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

    times = df["CleanedTime"].tolist()
    ao5 = compute_average(times, 5)
    ao12 = compute_average(times, 12)

    solves = []
    for i, (_, row) in enumerate(df.iterrows()):
        solves.append({
            "solveNumber": i + 1,
            "time": round(row["CleanedTime"], 3),
            "scramble": row["Scramble"],
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