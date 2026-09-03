"""MongoDB Atlas connection and helpers for user accounts + saved sessions."""
import logging
import os
from datetime import datetime, timezone

from pymongo import MongoClient, ASCENDING

log = logging.getLogger("solvestat.db")

_client = None
_db = None
_indexes_ready = False


def _now():
    return datetime.now(timezone.utc)


def get_db():
    """Lazily create a MongoClient from MONGODB_URI. Returns None if not configured.

    Index creation is best-effort and retried until it succeeds, so a transient
    Atlas hiccup at boot doesn't permanently wedge the connection.
    """
    global _client, _db, _indexes_ready
    uri = (os.environ.get("MONGODB_URI") or "").strip().strip('"').strip("'")
    # Tolerate the two env lines being pasted into one field by mistake.
    for junk in ("\nMONGODB_DB", " MONGODB_DB", "MONGODB_DB="):
        if junk in uri:
            uri = uri.split(junk, 1)[0].rstrip()
    if not uri:
        return None
    if _db is None:
        _client = MongoClient(uri, appname="SolveStat", serverSelectionTimeoutMS=8000)
        _db = _client[os.environ.get("MONGODB_DB", "solvestat")]
    if not _indexes_ready:
        try:
            _db.users.create_index([("uid", ASCENDING)], unique=True)
            _db.users.create_index([("handle", ASCENDING)], unique=True, sparse=True)
            _db.sessions.create_index([("uid", ASCENDING)])
            _db.sessions.create_index([("uid", ASCENDING), ("createdAt", ASCENDING)])
            _indexes_ready = True
        except Exception:
            log.exception("Could not create MongoDB indexes")
    return _db


def db_available() -> bool:
    """True only if we can actually reach the database."""
    try:
        db = get_db()
        if db is None:
            return False
        db.command("ping")
        return True
    except Exception:
        log.exception("MongoDB is not reachable")
        return False


# ─── Users ───────────────────────────────────────────────────────────────────

def get_or_create_user(uid: str, email: str = "", name: str = ""):
    db = get_db()
    user = db.users.find_one({"uid": uid})
    if user is None:
        doc = {
            "uid": uid,
            "email": email,
            "name": name,
            "wcaId": "",
            "createdAt": _now(),
            "updatedAt": _now(),
        }
        db.users.insert_one(doc)
        user = doc
    else:
        # keep email/name fresh without clobbering wcaId
        updates = {}
        if email and user.get("email") != email:
            updates["email"] = email
        if name and user.get("name") != name:
            updates["name"] = name
        if updates:
            updates["updatedAt"] = _now()
            db.users.update_one({"uid": uid}, {"$set": updates})
            user.update(updates)
    return user


def set_wca_id(uid: str, wca_id: str):
    db = get_db()
    db.users.update_one(
        {"uid": uid},
        {"$set": {"wcaId": wca_id, "updatedAt": _now()}},
    )
    return db.users.find_one({"uid": uid})


class HandleTaken(Exception):
    pass


def set_handle(uid: str, handle: str, public_name: str = None):
    """Set (or clear, with '') the user's public profile handle."""
    db = get_db()
    handle = (handle or "").strip().lower()
    if handle:
        existing = db.users.find_one({"handle": handle})
        if existing and existing["uid"] != uid:
            raise HandleTaken()
    updates = {"handle": handle or None, "updatedAt": _now()}
    if public_name is not None:
        updates["publicName"] = public_name.strip()
    db.users.update_one({"uid": uid}, {"$set": updates})
    return db.users.find_one({"uid": uid})


# ─── Sessions ────────────────────────────────────────────────────────────────

def _serialize_session(doc):
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", "session"),
        "solves": doc.get("solves", []),
        "stats": doc.get("stats", {}),
        "isPublic": bool(doc.get("isPublic", False)),
        "createdAt": doc["createdAt"].isoformat() if doc.get("createdAt") else None,
    }


def list_sessions(uid: str):
    db = get_db()
    cursor = db.sessions.find({"uid": uid}).sort("createdAt", ASCENDING)
    return [_serialize_session(d) for d in cursor]


def create_session(uid: str, name: str, solves: list, stats: dict):
    db = get_db()
    doc = {
        "uid": uid,
        "name": name,
        "solves": solves,
        "stats": stats,
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    res = db.sessions.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_session(doc)


def update_session(uid: str, session_id, name: str = None, is_public: bool = None):
    from bson import ObjectId
    from bson.errors import InvalidId
    db = get_db()
    try:
        oid = ObjectId(session_id)
    except (InvalidId, TypeError):
        return None
    fields = {"updatedAt": _now()}
    if name is not None:
        fields["name"] = name
    if is_public is not None:
        fields["isPublic"] = bool(is_public)
    res = db.sessions.update_one({"_id": oid, "uid": uid}, {"$set": fields})
    if res.matched_count == 0:
        return None
    return _serialize_session(db.sessions.find_one({"_id": oid}))


def delete_session(uid: str, session_id) -> bool:
    from bson import ObjectId
    from bson.errors import InvalidId
    db = get_db()
    try:
        oid = ObjectId(session_id)
    except (InvalidId, TypeError):
        return False
    res = db.sessions.delete_one({"_id": oid, "uid": uid})
    return res.deleted_count > 0


def user_totals(uid: str):
    db = get_db()
    sessions = list(db.sessions.find({"uid": uid}, {"solves": 1}))
    total_solves = sum(len(s.get("solves", [])) for s in sessions)
    return {"session_count": len(sessions), "total_solves": total_solves}


# ─── Public profile ──────────────────────────────────────────────────────────

def get_public_profile(handle: str):
    """Aggregate, chart-ready view of the sessions a user has marked public.
    Returns None if the handle is unknown or has no public sessions.
    Scrambles and comments are deliberately omitted."""
    db = get_db()
    handle = (handle or "").strip().lower()
    user = db.users.find_one({"handle": handle})
    if not user:
        return None
    sessions = list(
        db.sessions.find({"uid": user["uid"], "isPublic": True}).sort("createdAt", ASCENDING)
    )
    if not sessions:
        return None

    out, total = [], 0
    for s in sessions:
        solves = s.get("solves", [])
        total += len(solves)
        nondnf = [
            sv["time"] for sv in solves
            if sv.get("penalty") != "dnf" and sv.get("time") is not None
        ]
        out.append({
            "name": s.get("name", "session"),
            "count": len(solves),
            "mean": round(sum(nondnf) / len(nondnf), 3) if nondnf else None,
            "best": round(min(nondnf), 3) if nondnf else None,
            "worst": round(max(nondnf), 3) if nondnf else None,
            "solves": [
                {"t": sv.get("time"), "p": sv.get("penalty", "normal"), "d": sv.get("date", "")}
                for sv in solves
            ],
        })

    return {
        "handle": user["handle"],
        "display_name": user.get("publicName") or user.get("name") or user["handle"],
        "wca_id": user.get("wcaId", ""),
        "member_since": user["createdAt"].isoformat() if user.get("createdAt") else None,
        "total_solves": total,
        "session_count": len(out),
        "sessions": out,
    }
