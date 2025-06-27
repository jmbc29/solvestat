from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io

app = FastAPI()

# Allow frontend to communicate with backend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def clean_up_time(time):
    if isinstance(time, str):
        if "DNF" in time:
            c = time[3:]
            c = c[1:-1]
            return float(c)
        elif "+" in time:
            return float(time.strip("+"))
        else:
            return float(time)
    return time

def process_csv(contents):
    df = pd.read_csv(io.StringIO(contents.decode("utf-8")), sep=';')

    df['CleanedTime'] = df['Time'].apply(clean_up_time)
    df = df.dropna(subset=['CleanedTime'])  # Drop invalid or uncleanable times
    df['CleanedTime'] = df['CleanedTime'].astype(float)

    # Fill missing scramble fields with an empty string
    df['Scramble'] = df.get('Scramble', '').fillna('')

    solves = []
    for _, row in df.iterrows():
        solve = {
            "Time": round(row['CleanedTime'], 2),
            "Scramble": row['Scramble'],
        }
        solves.append(solve)

    return {"solves": solves}

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    result = process_csv(contents)
    return result