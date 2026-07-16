import os

from ..config import DEFAULT_SETTINGS
from ..database import db_cursor

SECRET_KEYS = {"openai_api_key", "anthropic_api_key"}
ENV_FALLBACK = {
    "openai_api_key": "OPENAI_API_KEY",
    "anthropic_api_key": "ANTHROPIC_API_KEY",
}


def get_settings_raw() -> dict:
    with db_cursor() as cur:
        cur.execute("SELECT key, value FROM settings")
        rows = cur.fetchall()
    data = dict(DEFAULT_SETTINGS)
    for row in rows:
        data[row["key"]] = row["value"]
    return data


def get_settings_public() -> dict:
    data = get_settings_raw()
    public = {}
    for key, value in data.items():
        if key in SECRET_KEYS:
            env_set = bool(os.environ.get(ENV_FALLBACK.get(key, ""), ""))
            public[key + "_set"] = bool(value) or env_set
            public[key + "_source"] = (
                "settings" if value else ("environment" if env_set else "none")
            )
        else:
            public[key] = value
    public["cloud_ai_enabled"] = data.get("llm_provider") in {"openai", "anthropic"}
    return public


def update_settings(updates: dict) -> dict:
    with db_cursor() as cur:
        for key, value in updates.items():
            if value is None:
                continue
            cur.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )
    return get_settings_public()


def resolve_secret(key: str) -> str:
    data = get_settings_raw()
    value = data.get(key, "")
    if value:
        return value
    env_name = ENV_FALLBACK.get(key)
    if env_name:
        return os.environ.get(env_name, "")
    return ""


def is_local_only() -> bool:
    return get_settings_raw().get("local_only", "false") == "true"
