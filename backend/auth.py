"""Firebase Admin SDK setup + FastAPI dependency to verify ID tokens."""
import json
import os

import firebase_admin
from firebase_admin import auth as fb_auth, credentials
from fastapi import Depends, HTTPException, Request

_initialized = False


def _init_firebase():
    """Initialize the Firebase Admin app once, from env.

    Accepts either:
      - FIREBASE_SERVICE_ACCOUNT : the service account JSON as a string
      - FIREBASE_SERVICE_ACCOUNT_FILE / GOOGLE_APPLICATION_CREDENTIALS : path to the JSON file
    """
    global _initialized
    if _initialized:
        return True
    if firebase_admin._apps:
        _initialized = True
        return True

    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )
    cred = None
    if raw:
        try:
            cred = credentials.Certificate(json.loads(raw))
        except (json.JSONDecodeError, ValueError) as e:
            raise RuntimeError(f"FIREBASE_SERVICE_ACCOUNT is not valid JSON: {e}")
    elif path and os.path.exists(path):
        cred = credentials.Certificate(path)

    if cred is None:
        return False

    firebase_admin.initialize_app(cred)
    _initialized = True
    return True


def firebase_available() -> bool:
    try:
        return _init_firebase()
    except RuntimeError:
        return False


async def require_user(request: Request) -> dict:
    """FastAPI dependency: verify the Firebase ID token in the Authorization header."""
    if not _init_firebase():
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the server.",
        )
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    token = header.split(" ", 1)[1].strip()
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return {
        "uid": decoded["uid"],
        "email": decoded.get("email", ""),
        "name": decoded.get("name", "") or decoded.get("email", ""),
        "picture": decoded.get("picture", ""),
        "provider": decoded.get("firebase", {}).get("sign_in_provider", ""),
    }


CurrentUser = Depends(require_user)
