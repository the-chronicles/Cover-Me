import os
import datetime
import hashlib
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Header, Request, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import bcrypt
from jose import JWTError, jwt
from dotenv import load_dotenv

# Slowapi rate-limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables from .env file
load_dotenv()

from .database.connection import Base, engine, get_db
from .database import models
from .services.messaging import MessagingService
from .services.ocr import extract_license_plate
from .services import storage, tasks
from .services.cache import cache_service
from .core import security
from .admin import setup_admin

# Create database tables (simple approach for MVP development)
Base.metadata.create_all(bind=engine)

import asyncio
messaging_service = MessagingService()

def dispatch_push_notification(user_id: int, title: str, message: str, db: Session):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user and user.push_token:
        try:
            asyncio.create_task(messaging_service.send_push_via_expo(
                push_token=user.push_token,
                title=title,
                body=message,
                data={"title": title, "body": message}
            ))
        except Exception as err:
            print(f"[Push Dispatch Exception] Could not dispatch push: {err}")


# Initialize Rate Limiter
redis_url = os.getenv("REDIS_URL")
if redis_url:
    limiter = Limiter(key_func=get_remote_address, storage_uri=redis_url)
else:
    limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="CoverMe API",
    description="Safety and location intelligence backend for Nigeria (SMS & WhatsApp Fallback layer)",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount SQLAdmin dashboard at /admin (password-protected)
setup_admin(app)

# Mount static folder for serving uploads
os.makedirs(os.path.join(os.getcwd(), "static", "uploads"), exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# --- Pydantic Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone_number: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    phone_number: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    user_id: Optional[int] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None

class PushTokenRequest(BaseModel):
    push_token: str

class ContactCreate(BaseModel):
    name: str
    phone_number: str
    relation: Optional[str] = None

class ContactResponse(BaseModel):
    id: int
    name: str
    phone_number: str
    relation: Optional[str] = None

    class Config:
        from_attributes = True

class LocationUpdate(BaseModel):
    lat: float
    lng: float

class SOSTrigger(BaseModel):
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    trigger_source: Optional[str] = "button"  # button, voice, anomaly

class JourneyStart(BaseModel):
    start_location: str
    destination: str
    emergency_contact_phone: Optional[str] = None
    duration_minutes: int
    license_plate: Optional[str] = None
    watcher_type: Optional[str] = None # 'member' or 'circle'
    watcher_id: Optional[int] = None

class JourneyResponse(BaseModel):
    id: int
    start_location: str
    destination: str
    emergency_contact_phone: Optional[str] = None
    duration_minutes: int
    license_plate: Optional[str] = None
    watcher_type: Optional[str] = None
    watcher_id: Optional[int] = None
    is_active: bool
    started_at: datetime.datetime

    class Config:
        from_attributes = True

class SOSActiveResponse(BaseModel):
    id: int
    user_id: int
    status: str
    trigger_source: str
    triggered_at: datetime.datetime

    class Config:
        from_attributes = True


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    message: str
    read: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class CircleInviteRequest(BaseModel):
    recipient_email_or_phone: str
    role: Optional[str] = "Member"


class CommandLineResponse(BaseModel):
    id: int
    state: str
    lga: str
    facility_name: str
    facility_type: str
    phone_number: str

    class Config:
        from_attributes = True


class CircleCreate(BaseModel):
    name: str
    category: str
    role: str


class CircleJoin(BaseModel):
    invite_code: str
    role: str


class CircleMemberResponse(BaseModel):
    user_id: int
    full_name: str
    phone_number: str
    role: str
    joined_at: datetime.datetime

    class Config:
        from_attributes = True


class CircleResponse(BaseModel):
    id: int
    name: str
    category: str
    invite_code: str
    created_at: datetime.datetime
    members: List[CircleMemberResponse]

    class Config:
        from_attributes = True


# --- Auth Helpers ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# Helper to verify token and return user
async def get_authenticated_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        print(f"[Auth Error] Authorization header missing or not Bearer: {authorization}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    token = authorization.split(" ")[1]
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        sub = payload.get("sub")
        token_type = payload.get("type")
        if sub is None or token_type != "access":
            print(f"[Auth Error] Invalid sub or token type: sub={sub}, type={token_type}")
            raise credentials_exception
        user_id = int(sub)
    except JWTError as e:
        print(f"[Auth Error] JWT Decode Error: {e}, Token: {token[:15]}...")
        raise credentials_exception
    except ValueError as e:
        print(f"[Auth Error] Value Error parsing user_id: {e}")
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        print(f"[Auth Error] User {user_id} not found in database")
        raise credentials_exception
    return user


# --- Startup Seeding ---
def patch_database_schema(db: Session):
    from sqlalchemy import text
    dialect = db.bind.dialect.name
    if dialect == "postgresql":
        try:
            db.execute(text("ALTER TABLE journeys ADD COLUMN IF NOT EXISTS watcher_type VARCHAR;"))
            db.execute(text("ALTER TABLE journeys ADD COLUMN IF NOT EXISTS watcher_id INTEGER;"))
            db.execute(text("ALTER TABLE journeys ALTER COLUMN emergency_contact_phone DROP NOT NULL;"))
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;"))
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;"))
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP;"))
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token VARCHAR;"))
            db.commit()
            print("[Startup Migration] PostgreSQL schema successfully patched.")
        except Exception as e:
            db.rollback()
            print(f"[Startup Migration Error] Failed to patch PostgreSQL: {e}")
    else:
        # SQLite fallback
        for query in [
            "ALTER TABLE journeys ADD COLUMN watcher_type VARCHAR;",
            "ALTER TABLE journeys ADD COLUMN watcher_id INTEGER;",
            "ALTER TABLE users ADD COLUMN last_lat FLOAT;",
            "ALTER TABLE users ADD COLUMN last_lng FLOAT;",
            "ALTER TABLE users ADD COLUMN location_updated_at TIMESTAMP;",
            "ALTER TABLE users ADD COLUMN push_token VARCHAR;"
        ]:
            try:
                db.execute(text(query))
                db.commit()
            except Exception:
                db.rollback()
        print("[Startup Migration] SQLite fallback migration run complete.")

@app.on_event("startup")
def seed_database():
    db = next(get_db())
    # Patch schema first
    patch_database_schema(db)
    # Seed emergency command lines if empty
    if db.query(models.EmergencyCommandLine).count() == 0:
        seed_data = [
            # Lagos division command lines
            models.EmergencyCommandLine(state="Lagos", lga="Ikeja", facility_name="Ikeja Divisional Police HQ", facility_type="police", phone_number="+2348033011234"),
            models.EmergencyCommandLine(state="Lagos", lga="Lagos Island", facility_name="Lion Building Divisional Police Station", facility_type="police", phone_number="+2348034567890"),
            models.EmergencyCommandLine(state="Lagos", lga="Ikeja", facility_name="Lagos State Emergency Service Center (LASEMA)", facility_type="hospital", phone_number="+2348067891234"),
            models.EmergencyCommandLine(state="Lagos", lga="Surulere", facility_name="Surulere Fire Station Division", facility_type="fire", phone_number="+2348123456789"),
            # Oyo (Ibadan) division command lines
            models.EmergencyCommandLine(state="Oyo", lga="Ibadan North", facility_name="Sango Police Station Division", facility_type="police", phone_number="+2348031122334"),
            models.EmergencyCommandLine(state="Oyo", lga="Ibadan North", facility_name="UCH Ibadan Emergency Ward", facility_type="hospital", phone_number="+2348055556666"),
            # Oyo (Ogbomoso)
            models.EmergencyCommandLine(state="Oyo", lga="Ogbomoso North", facility_name="Ogbomoso Owode Divisional Police HQ", facility_type="police", phone_number="+2348032223344"),
            models.EmergencyCommandLine(state="Oyo", lga="Ogbomoso South", facility_name="LAUTECH Teaching Hospital Emergency", facility_type="hospital", phone_number="+2348077778888"),
            # Ogun (Abeokuta)
            models.EmergencyCommandLine(state="Ogun", lga="Abeokuta South", facility_name="Ibara Police Station", facility_type="police", phone_number="+2348039998888"),
            # Ondo (Akure)
            models.EmergencyCommandLine(state="Ondo", lga="Akure South", facility_name="Akure Divisional Police HQ", facility_type="police", phone_number="+2348030001111"),
        ]
        db.add_all(seed_data)
        db.commit()
    db.close()


# --- API Routes ---

@app.get("/")
def read_root():
    return {
        "status": "online",
        "slogan": "never walk alone.",
        "brand": "CoverMe Nigeria"
    }

# Authentications
@app.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user_data.password)
    new_user = models.User(
        email=user_data.email,
        hashed_password=hashed_pwd,
        full_name=user_data.full_name,
        phone_number=user_data.phone_number
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token = security.create_access_token(user.id)
    
    # Generate refresh token
    refresh_token_str = security.generate_secure_token()
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    
    db_token = models.RefreshToken(
        user_id=user.id,
        token=token_hash,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=30)
    )
    db.add(db_token)
    db.commit()
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "user": user
    }

@app.post("/refresh", response_model=Token)
def refresh_token(refresh_data: RefreshRequest, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(refresh_data.refresh_token.encode()).hexdigest()
    db_token = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == token_hash,
        models.RefreshToken.revoked == False
    ).first()
    
    if not db_token or db_token.expires_at < datetime.datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Revoke old refresh token (token rotation)
    db_token.revoked = True
    db.commit()
    
    # Create new pair
    new_access = security.create_access_token(db_token.user_id)
    new_refresh_str = security.generate_secure_token()
    new_refresh_hash = hashlib.sha256(new_refresh_str.encode()).hexdigest()
    
    db_new_token = models.RefreshToken(
        user_id=db_token.user_id,
        token=new_refresh_hash,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=30)
    )
    db.add(db_new_token)
    db.commit()
    
    user = db.query(models.User).filter(models.User.id == db_token.user_id).first()
    return {
        "access_token": new_access,
        "refresh_token": new_refresh_str,
        "token_type": "bearer",
        "user": user
    }

@app.post("/user/update", response_model=UserResponse)
def update_user(
    user_data: UserUpdate,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
    if user_data.phone_number is not None:
        current_user.phone_number = user_data.phone_number

    db.commit()
    db.refresh(current_user)
    return current_user

@app.post("/users/push-token")
def register_push_token(
    payload: PushTokenRequest,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    current_user.push_token = payload.push_token
    db.commit()
    return {"status": "success", "message": "Push token registered successfully."}

@app.post("/user/delete")
def delete_user(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Log the deletion message to persistent admin notifications
    notification_msg = f"User {current_user.full_name} ({current_user.email}) just deleted their account."
    notification = models.AdminNotification(message=notification_msg)
    db.add(notification)
    
    # Delete the user (this triggers cascade deletes)
    db.delete(current_user)
    db.commit()
    
    return {
        "status": "success",
        "message": "Account successfully deleted."
    }

# Trusted Circle (Contacts)
@app.post("/contacts/add", response_model=ContactResponse)
def add_contact(
    contact: ContactCreate, 
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Enforce maximum of 3 emergency contacts
    existing_count = db.query(models.TrustedContact).filter(models.TrustedContact.user_id == current_user.id).count()
    if existing_count >= 3:
        raise HTTPException(status_code=400, detail="Maximum of 3 emergency contacts reached.")

    new_contact = models.TrustedContact(
        user_id=current_user.id,
        name=contact.name,
        phone_number=contact.phone_number,
        relation=contact.relation
    )
    db.add(new_contact)
    db.commit()
    db.refresh(new_contact)
    return new_contact

@app.get("/contacts/list", response_model=List[ContactResponse])
def get_contacts(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    return db.query(models.TrustedContact).filter(models.TrustedContact.user_id == current_user.id).all()

@app.post("/contacts/{contact_id}/update", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    contact_data: ContactCreate,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    db_contact = db.query(models.TrustedContact).filter(
        models.TrustedContact.id == contact_id,
        models.TrustedContact.user_id == current_user.id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Emergency contact not found.")
    
    db_contact.name = contact_data.name
    db_contact.phone_number = contact_data.phone_number
    db_contact.relation = contact_data.relation
    db.commit()
    db.refresh(db_contact)
    return db_contact

@app.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: int,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    db_contact = db.query(models.TrustedContact).filter(
        models.TrustedContact.id == contact_id,
        models.TrustedContact.user_id == current_user.id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Emergency contact not found.")
    
    db.delete(db_contact)
    db.commit()
    return {"status": "success", "message": "Emergency contact deleted successfully."}

import math

# Haversine distance calculator in kilometers
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Pre-defined security hotspot zones in Southwest Nigeria
SECURITY_HOTSPOTS = [
    {
        "name": "Ikeja Security Alert Zone",
        "lat": 6.5966,
        "lng": 3.3362,
        "radius_km": 1.0,
        "advice": "Keep car doors locked, slow speeds, stay alert for pedestrian activity."
    },
    {
        "name": "Lagos-Ibadan Expressway Sector",
        "lat": 6.6850,
        "lng": 3.4200,
        "radius_km": 2.0,
        "advice": "High speed sector, avoid stops, keep windows fully rolled up."
    },
    {
        "name": "UCH Ibadan Boundary Area",
        "lat": 7.4019,
        "lng": 3.9067,
        "radius_km": 1.5,
        "advice": "High congestion area, watch out for double-parked vehicles and traffic scams."
    }
]

# Live Location Tracking
@app.post("/location/update")
def update_location(
    loc: LocationUpdate,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Update coordinates in DB
    current_user.last_lat = loc.lat
    current_user.last_lng = loc.lng
    current_user.location_updated_at = datetime.datetime.utcnow()
    db.commit()

    # Log location updates to standard output (acting as location sync layer)
    print(f"[Location Sync] User {current_user.id} ({current_user.full_name}) moved to Lat: {loc.lat}, Lng: {loc.lng}")
    
    # Check if user entered any geofenced security hotspot
    active_warning = None
    for hotspot in SECURITY_HOTSPOTS:
        dist = calculate_distance(loc.lat, loc.lng, hotspot["lat"], hotspot["lng"])
        if dist <= hotspot["radius_km"]:
            print(f"[GEOFENCE WARNING] User {current_user.id} entered hotspot: {hotspot['name']} (Distance: {dist:.2f}km)")
            active_warning = {
                "in_hotspot": True,
                "name": hotspot["name"],
                "advice": hotspot["advice"],
                "distance_km": round(dist, 2)
            }
            break # Trigger one warning at a time

    response_payload = {
        "status": "success",
        "message": "Location updated successfully"
    }
    if active_warning:
        response_payload["risk_warning"] = active_warning
        
    return response_payload

# SOS System
@app.post("/sos/trigger")
@limiter.limit("1/30 seconds")
async def trigger_sos(
    request: Request,
    sos: SOSTrigger,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    # Encrypt coordinates before saving to database to protect user privacy
    enc_lat = security.encrypt_coordinate(sos.location_lat)
    enc_lng = security.encrypt_coordinate(sos.location_lng)

    # Record the SOS in the database
    new_sos = models.SOSAlert(
        user_id=current_user.id,
        location_lat=enc_lat,
        location_lng=enc_lng,
        trigger_source=sos.trigger_source,
        status="active"
    )
    db.add(new_sos)
    db.commit()
    db.refresh(new_sos)

    # Query User's Trusted Contacts
    contacts = db.query(models.TrustedContact).filter(models.TrustedContact.user_id == current_user.id).all()
    contact_numbers = set(c.phone_number for c in contacts)

    # Query all users in the circles the current user belongs to
    my_memberships = db.query(models.CircleMember).filter(models.CircleMember.user_id == current_user.id).all()
    my_circle_ids = [m.circle_id for m in my_memberships]
    
    if my_circle_ids:
        circle_members = db.query(models.CircleMember).filter(
            models.CircleMember.circle_id.in_(my_circle_ids),
            models.CircleMember.user_id != current_user.id
        ).all()
        # Deduplicate circle member user IDs to prevent duplicate notifications
        unique_member_ids = {cm.user_id for cm in circle_members}
        for member_id in unique_member_ids:
            # Create in-app notification for each unique circle member
            new_notif = models.Notification(
                user_id=member_id,
                type="sos_alert",
                title="Emergency SOS Alert!",
                message=f"{current_user.full_name} ({current_user.phone_number}) triggered an SOS emergency alert!"
            )
            db.add(new_notif)
        db.commit()
        for member_id in unique_member_ids:
            dispatch_push_notification(
                user_id=member_id,
                title="Emergency SOS Alert!",
                message=f"{current_user.full_name} ({current_user.phone_number}) triggered an SOS emergency alert!",
                db=db
            )
                
    contact_numbers_list = list(contact_numbers)

    # Build safety alert template with plaintext coordinates for maps link
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    coordinates = f"{sos.location_lat},{sos.location_lng}" if (sos.location_lat and sos.location_lng) else "Unknown Coordinates"
    location_link = f"https://maps.google.com/?q={coordinates}"
    message_text = f"EMERGENCY! {current_user.full_name} ({current_user.phone_number}) triggered SOS at location: {location_link}. Never walk alone."
    
    # Offload SMS/WhatsApp delivery chain execution to FastAPI BackgroundTasks queue
    # Pass user name + phone number in parentheses so it renders correctly in WhatsApp templates
    background_tasks.add_task(
        tasks.run_sos_delivery_task,
        sos_id=new_sos.id,
        contacts=contact_numbers_list,
        user_name=f"{current_user.full_name} ({current_user.phone_number})",
        location_link=location_link,
        timestamp=timestamp_str,
        sms_text=message_text
    )

    return {
        "status": "triggered",
        "sos_id": new_sos.id,
        "source": sos.trigger_source,
        "recipient_contacts_count": len(contact_numbers_list),
        "message": "SOS alert triggered successfully. Dispatches are processing asynchronously."
    }

@app.post("/sos/voice-trigger")
@limiter.limit("1/30 seconds")
async def trigger_sos_voice(
    request: Request,
    sos: SOSTrigger,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    sos.trigger_source = "voice"
    return await trigger_sos(
        request=request,
        sos=sos,
        current_user=current_user,
        db=db,
        background_tasks=background_tasks
    )

@app.get("/sos/active", response_model=Optional[SOSActiveResponse])
def get_active_sos(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Return the current user's active SOS alert, or null if none."""
    alert = db.query(models.SOSAlert).filter(
        models.SOSAlert.user_id == current_user.id,
        models.SOSAlert.status == "active"
    ).order_by(models.SOSAlert.triggered_at.desc()).first()
    return alert  # None returns as JSON null (Optional response)

@app.post("/sos/resolve")
def resolve_sos(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Mark the current user's active SOS alert as resolved."""
    alerts = db.query(models.SOSAlert).filter(
        models.SOSAlert.user_id == current_user.id,
        models.SOSAlert.status == "active"
    ).all()
    if not alerts:
        return {"status": "ok", "message": "No active SOS to resolve."}
    for alert in alerts:
        alert.status = "resolved"
    db.commit()
    return {"status": "resolved", "count": len(alerts)}

# Follow Me Journey tracking
@app.post("/journey/start", response_model=JourneyResponse)
async def start_journey(
    journey: JourneyStart,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_authenticated_user),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    # Deactivate existing active journeys for this user
    db.query(models.Journey).filter(
        models.Journey.user_id == current_user.id, 
        models.Journey.is_active == True
    ).update({"is_active": False})

    # Resolve watchers
    phones = []
    watchers_users = []
    
    if journey.watcher_type == "member" and journey.watcher_id:
        watcher_user = db.query(models.User).filter(models.User.id == journey.watcher_id).first()
        if watcher_user:
            watchers_users.append(watcher_user)
            if watcher_user.phone_number:
                phones.append(watcher_user.phone_number)
    elif journey.watcher_type == "circle" and journey.watcher_id:
        memberships = db.query(models.CircleMember).filter(
            models.CircleMember.circle_id == journey.watcher_id,
            models.CircleMember.user_id != current_user.id
        ).all()
        for m in memberships:
            watcher_user = db.query(models.User).filter(models.User.id == m.user_id).first()
            if watcher_user:
                watchers_users.append(watcher_user)
                if watcher_user.phone_number:
                    phones.append(watcher_user.phone_number)
    
    if not phones and journey.emergency_contact_phone:
        # Fallback to direct raw input phone number if no circle selection was processed
        phones = [journey.emergency_contact_phone]

    phone_str = ",".join(set(phones)) if phones else None

    new_journey = models.Journey(
        user_id=current_user.id,
        start_location=journey.start_location,
        destination=journey.destination,
        emergency_contact_phone=phone_str,
        duration_minutes=journey.duration_minutes,
        license_plate=journey.license_plate,
        watcher_type=journey.watcher_type,
        watcher_id=journey.watcher_id,
        is_active=True
    )
    db.add(new_journey)
    db.commit()
    db.refresh(new_journey)

    # Dispatch in-app notifications
    for wu in watchers_users:
        notif = models.Notification(
            user_id=wu.id,
            type="journey_start",
            title="Circle Member Journey Started",
            message=f"{current_user.full_name} started a journey from {journey.start_location} to {journey.destination}."
        )
        db.add(notif)
    db.commit()
    for wu in watchers_users:
        dispatch_push_notification(
            user_id=wu.id,
            title="Circle Member Journey Started",
            message=f"{current_user.full_name} started a journey from {journey.start_location} to {journey.destination}.",
            db=db
        )

    # Queue out-of-band watchers notifications
    for phone in set(phones):
        background_tasks.add_task(
            tasks.run_journey_start_task,
            recipient=phone,
            user_name=current_user.full_name,
            start_location=journey.start_location,
            destination=journey.destination,
            duration_minutes=journey.duration_minutes,
            license_plate=journey.license_plate or ""
        )

    return new_journey

@app.post("/ocr/detect")
async def detect_plate(
    photo: UploadFile = File(...),
    current_user: models.User = Depends(get_authenticated_user)
):
    """Run OCR detection on an uploaded vehicle photo immediately."""
    photo_bytes = await photo.read()
    detected_plate = extract_license_plate(photo_bytes)
    return {"status": "success", "license_plate": detected_plate}

@app.post("/admin-api/broadcast")
async def admin_broadcast(
    request: Request,
    title: str = Form(...),
    message: str = Form(...),
    db: Session = Depends(get_db)
):
    # Verify session authentication
    if not request.session.get("admin_authenticated", False):
        raise HTTPException(status_code=403, detail="Forbidden. Admin authentication required.")
        
    # Fetch all users with registered push tokens
    users = db.query(models.User).filter(
        models.User.push_token.isnot(None),
        models.User.push_token != ""
    ).all()
    
    if not users:
        return {
            "status": "success",
            "success_count": 0,
            "failure_count": 0,
            "detail": "No users with active push tokens."
        }
        
    success_count = 0
    failure_count = 0
    
    for u in users:
        # Personalize if {name} placeholder is used
        personalized_msg = message.replace("{name}", u.full_name)
        res = await messaging_service.send_push_via_expo(
            push_token=u.push_token,
            title=title,
            body=personalized_msg
        )
        if res.get("status") == "success":
            success_count += 1
        else:
            failure_count += 1
            
    return {
        "status": "success",
        "success_count": success_count,
        "failure_count": failure_count
    }

@app.post("/journey/vehicle-photo")
async def upload_vehicle_photo(
    journey_id: int,
    photo: UploadFile = File(...),
    license_plate: Optional[str] = Form(None),
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Find the journey and make sure it belongs to the current user
    journey = db.query(models.Journey).filter(
        models.Journey.id == journey_id,
        models.Journey.user_id == current_user.id
    ).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found or unauthorized")
        
    # Read photo file bytes
    photo_bytes = await photo.read()
    
    # If a pre-verified license plate was provided, use it. Otherwise, perform OCR extraction.
    if license_plate:
        detected_plate = license_plate
    else:
        detected_plate = extract_license_plate(photo_bytes)
    
    # Upload photo to Cloudflare R2 / AWS S3 storage (falls back to local filesystem in dev)
    photo_url = storage.upload_vehicle_photo(photo_bytes, photo.filename)
    
    journey.license_plate_photo_url = photo_url
    journey.license_plate = detected_plate
        
    db.commit()
    db.refresh(journey)
    
    return {
        "status": "success",
        "url": photo_url,
        "ocr_license_plate_detected": detected_plate,
        "journey": journey
    }

@app.get("/journey/my-active", response_model=Optional[JourneyResponse])
def get_my_active_journey(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Return the current user's own active journey, or null if none."""
    journey = db.query(models.Journey).filter(
        models.Journey.user_id == current_user.id,
        models.Journey.is_active == True
    ).order_by(models.Journey.started_at.desc()).first()
    return journey  # None returns as JSON null

@app.post("/journey/end")
def end_journey(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    """Mark the current user's active journey as ended."""
    journeys = db.query(models.Journey).filter(
        models.Journey.user_id == current_user.id,
        models.Journey.is_active == True
    ).all()
    if not journeys:
        return {"status": "ok", "message": "No active journey to end."}
    for j in journeys:
        j.is_active = False
    db.commit()
    return {"status": "ended", "count": len(journeys)}

# Direct Command Lines DB Search
@app.get("/emergency/command-lines", response_model=List[CommandLineResponse])
def get_command_lines(
    state: Optional[str] = None,
    lga: Optional[str] = None,
    facility_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # Construct cache key
    cache_key = f"cmd_lines:state={state or ''}:lga={lga or ''}:type={facility_type or ''}"
    cached_data = cache_service.get(cache_key)
    
    if cached_data:
        print(f"[Cache Hit] Returning cached emergency command lines for {cache_key}")
        # Map raw dictionary cache items back to the Pydantic structure
        return [CommandLineResponse(**item) for item in cached_data]

    print(f"[Cache Miss] Querying database for emergency command lines: {cache_key}")
    query = db.query(models.EmergencyCommandLine)
    if state:
        query = query.filter(models.EmergencyCommandLine.state.ilike(state))
    if lga:
        query = query.filter(models.EmergencyCommandLine.lga.ilike(lga))
    if facility_type:
        query = query.filter(models.EmergencyCommandLine.facility_type == facility_type)
        
    results = query.all()
    
    # Serialize to dictionary list and write to Redis (valid for 1 Hour)
    serializable = []
    for r in results:
        serializable.append({
            "id": r.id,
            "state": r.state,
            "lga": r.lga,
            "facility_name": r.facility_name,
            "facility_type": r.facility_type,
            "phone_number": r.phone_number
        })
    cache_service.set(cache_key, serializable, expire_seconds=3600)
    
    return results


# --- Circle Management Routes ---

import random
import string

def generate_invite_code(db: Session) -> str:
    # Format: ZJE-ITS (3 letters, dash, 3 letters)
    letters = string.ascii_uppercase
    while True:
        part1 = "".join(random.choice(letters) for _ in range(3))
        part2 = "".join(random.choice(letters) for _ in range(3))
        code = f"{part1}-{part2}"
        # Check if code is unique
        exists = db.query(models.Circle).filter(models.Circle.invite_code == code).first()
        if not exists:
            return code


@app.post("/circles/create", response_model=CircleResponse)
def create_circle(
    circle_data: CircleCreate,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    invite_code = generate_invite_code(db)
    new_circle = models.Circle(
        name=circle_data.name,
        category=circle_data.category,
        invite_code=invite_code
    )
    db.add(new_circle)
    db.commit()
    db.refresh(new_circle)

    # Add creator as a member
    member = models.CircleMember(
        circle_id=new_circle.id,
        user_id=current_user.id,
        role=circle_data.role
    )
    db.add(member)
    db.commit()
    
    return get_circle_response(new_circle.id, db)


@app.post("/circles/join", response_model=CircleResponse)
def join_circle(
    join_data: CircleJoin,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Find circle by invite code
    code = join_data.invite_code.strip().upper()
    circle = db.query(models.Circle).filter(models.Circle.invite_code == code).first()
    if not circle:
        raise HTTPException(status_code=404, detail="Circle invite code not found.")

    # Check if user is already a member
    existing_member = db.query(models.CircleMember).filter(
        models.CircleMember.circle_id == circle.id,
        models.CircleMember.user_id == current_user.id
    ).first()
    if existing_member:
        # Just update role
        existing_member.role = join_data.role
        db.commit()
    else:
        # Create new member
        new_member = models.CircleMember(
            circle_id=circle.id,
            user_id=current_user.id,
            role=join_data.role
        )
        db.add(new_member)
        db.commit()

        # In-app notifications to other members
        other_members = db.query(models.CircleMember).filter(
            models.CircleMember.circle_id == circle.id,
            models.CircleMember.user_id != current_user.id
        ).all()
        for om in other_members:
            new_notif = models.Notification(
                user_id=om.user_id,
                type="circle_join",
                title="New Circle Member",
                message=f"{current_user.full_name} has joined the circle '{circle.name}' as {join_data.role}."
            )
            db.add(new_notif)
        db.commit()
        for om in other_members:
            dispatch_push_notification(
                user_id=om.user_id,
                title="New Circle Member",
                message=f"{current_user.full_name} has joined the circle '{circle.name}' as {join_data.role}.",
                db=db
            )

    return get_circle_response(circle.id, db)


@app.get("/circles/my", response_model=List[CircleResponse])
def get_my_circles(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Find all circles where current_user is a member
    memberships = db.query(models.CircleMember).filter(models.CircleMember.user_id == current_user.id).all()
    circle_ids = [m.circle_id for m in memberships]
    
    response = []
    for cid in circle_ids:
        response.append(get_circle_response(cid, db))
    return response


@app.post("/circles/{circle_id}/leave")
def leave_circle(
    circle_id: int,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Find member record
    member = db.query(models.CircleMember).filter(
        models.CircleMember.circle_id == circle_id,
        models.CircleMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Circle membership not found.")

    db.delete(member)
    db.commit()

    # If circle has no members left, delete the circle entirely
    remaining = db.query(models.CircleMember).filter(models.CircleMember.circle_id == circle_id).count()
    if remaining == 0:
        circle = db.query(models.Circle).filter(models.Circle.id == circle_id).first()
        if circle:
            db.delete(circle)
            db.commit()

    return {"status": "success", "message": "Successfully left the circle."}


# Helper function to construct rich CircleResponse
def get_circle_response(circle_id: int, db: Session):
    circle = db.query(models.Circle).filter(models.Circle.id == circle_id).first()
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")
        
    members_list = []
    members = db.query(models.CircleMember).filter(models.CircleMember.circle_id == circle_id).all()
    for m in members:
        user = db.query(models.User).filter(models.User.id == m.user_id).first()
        if user:
            members_list.append({
                "user_id": user.id,
                "full_name": user.full_name,
                "phone_number": user.phone_number,
                "role": m.role,
                "joined_at": m.joined_at
            })
    return {
        "id": circle.id,
        "name": circle.name,
        "category": circle.category,
        "invite_code": circle.invite_code,
        "created_at": circle.created_at,
        "members": members_list
    }


# --- Notifications & Live Watched Journey Endpoints ---

@app.get("/notifications", response_model=List[NotificationResponse])
def get_notifications(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).all()


@app.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    
    notif.read = True
    db.commit()
    return {"status": "success", "message": "Notification marked as read."}


@app.post("/notifications/read-all")
def mark_all_notifications_read(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.read == False
    ).update({"read": True}, synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "All notifications marked as read."}


@app.post("/circles/{circle_id}/invite")
def invite_to_circle(
    circle_id: int,
    invite_req: CircleInviteRequest,
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Ensure user is a member of this circle
    membership = db.query(models.CircleMember).filter(
        models.CircleMember.circle_id == circle_id,
        models.CircleMember.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="You do not belong to this circle.")
        
    circle = db.query(models.Circle).filter(models.Circle.id == circle_id).first()
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found.")
        
    # Find recipient by email or phone
    term = invite_req.recipient_email_or_phone.strip()
    recipient = db.query(models.User).filter(
        (models.User.email == term) | (models.User.phone_number == term)
    ).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="No registered CoverMe user found with this email or phone number.")
        
    # Check if already a member
    is_member = db.query(models.CircleMember).filter(
        models.CircleMember.circle_id == circle_id,
        models.CircleMember.user_id == recipient.id
    ).first()
    if is_member:
        raise HTTPException(status_code=400, detail="User is already a member of this circle.")
        
    invite_msg = f"{current_user.full_name} invited you to join circle '{circle.name}'. Use invite code: {circle.invite_code}."
    notif = models.Notification(
        user_id=recipient.id,
        type="circle_invite",
        title="Circle Invitation",
        message=invite_msg
    )
    db.add(notif)
    db.commit()
    dispatch_push_notification(
        user_id=recipient.id,
        title="Circle Invitation",
        message=invite_msg,
        db=db
    )
    
    return {"status": "success", "message": f"Invitation successfully sent to {recipient.full_name}."}


class ActiveWatchedJourney(BaseModel):
    journey_id: int
    traveler_id: int
    traveler_name: str
    start_location: str
    destination: str
    duration_minutes: int
    license_plate: Optional[str] = None
    started_at: datetime.datetime
    last_lat: Optional[float] = None
    last_lng: Optional[float] = None
    location_updated_at: Optional[datetime.datetime] = None


@app.get("/journey/active-watched", response_model=List[ActiveWatchedJourney])
def get_active_watched_journeys(
    current_user: models.User = Depends(get_authenticated_user),
    db: Session = Depends(get_db)
):
    # Find all circles where current_user is a member
    memberships = db.query(models.CircleMember).filter(models.CircleMember.user_id == current_user.id).all()
    my_circle_ids = [m.circle_id for m in memberships]
    
    # Query active journeys of other users
    query = db.query(models.Journey).filter(
        models.Journey.is_active == True,
        models.Journey.user_id != current_user.id
    )
    
    if my_circle_ids:
        journeys = query.filter(
            ((models.Journey.watcher_type == "circle") & (models.Journey.watcher_id.in_(my_circle_ids))) |
            ((models.Journey.watcher_type == "member") & (models.Journey.watcher_id == current_user.id))
        ).all()
    else:
        journeys = query.filter(
            (models.Journey.watcher_type == "member") & (models.Journey.watcher_id == current_user.id)
        ).all()
        
    results = []
    for j in journeys:
        traveler = db.query(models.User).filter(models.User.id == j.user_id).first()
        if traveler:
            results.append({
                "journey_id": j.id,
                "traveler_id": traveler.id,
                "traveler_name": traveler.full_name,
                "start_location": j.start_location,
                "destination": j.destination,
                "duration_minutes": j.duration_minutes,
                "license_plate": j.license_plate,
                "started_at": j.started_at,
                "last_lat": traveler.last_lat,
                "last_lng": traveler.last_lng,
                "location_updated_at": traveler.location_updated_at
            })
            
    return results
