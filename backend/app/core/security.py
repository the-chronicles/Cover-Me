import os
import base64
import hashlib
import datetime
import secrets
from typing import Any
from cryptography.fernet import Fernet
from jose import jwt

# --- JWT Configuration ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "coverme-super-safety-secret-key-1092837")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 7200  # 5 days (5 * 24 * 60) — session persists for 5 days of inactivity
REFRESH_TOKEN_EXPIRE_DAYS = 30      # Long-lived refresh tokens

# --- Encryption Configuration ---
# Derive a valid Fernet key (32 bytes urlsafe base64) from JWT_SECRET_KEY or LOCATION_ENCRYPTION_KEY
raw_key_source = os.getenv("LOCATION_ENCRYPTION_KEY") or SECRET_KEY
hashed_key = hashlib.sha256(raw_key_source.encode()).digest()
fernet_key = base64.urlsafe_b64encode(hashed_key)
fernet = Fernet(fernet_key)

def encrypt_coordinate(val: float) -> str:
    """Encrypt a floating point coordinate to a secure string."""
    if val is None:
        return None
    return fernet.encrypt(str(val).encode()).decode()

def decrypt_coordinate(encrypted_val: str) -> float:
    """Decrypt a coordinate string back to a float."""
    if not encrypted_val:
        return None
    try:
        decrypted_bytes = fernet.decrypt(encrypted_val.encode())
        return float(decrypted_bytes.decode())
    except Exception as e:
        print(f"[Decrypt Error] Failed to decrypt location coordinate: {e}")
        return None

def create_access_token(user_id: int) -> str:
    """Generate a short-lived access JWT token."""
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access"
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def generate_secure_token() -> str:
    """Generate a secure, random string token for refresh tokens."""
    return secrets.token_urlsafe(32)
