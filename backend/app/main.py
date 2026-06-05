import os
import datetime
import hashlib
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Header, Request, BackgroundTasks
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

messaging_service = MessagingService()

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
    emergency_contact_phone: str
    duration_minutes: int
    license_plate: Optional[str] = None

class JourneyResponse(BaseModel):
    id: int
    start_location: str
    destination: str
    emergency_contact_phone: str
    duration_minutes: int
    license_plate: Optional[str] = None
    is_active: bool
    started_at: datetime.datetime

    class Config:
        from_attributes = True

class CommandLineResponse(BaseModel):
    id: int
    state: str
    lga: str
    facility_name: str
    facility_type: str
    phone_number: str

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
@app.on_event("startup")
def seed_database():
    db = next(get_db())
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
    contact_numbers = [c.phone_number for c in contacts]

    # Build safety alert template with plaintext coordinates for maps link
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    coordinates = f"{sos.location_lat},{sos.location_lng}" if (sos.location_lat and sos.location_lng) else "Unknown Coordinates"
    location_link = f"https://maps.google.com/?q={coordinates}"
    message_text = f"EMERGENCY! {current_user.full_name} ({current_user.phone_number}) triggered SOS at location: {location_link}. Never walk alone."
    
    # Offload SMS/WhatsApp delivery chain execution to FastAPI BackgroundTasks queue
    background_tasks.add_task(
        tasks.run_sos_delivery_task,
        sos_id=new_sos.id,
        contacts=contact_numbers,
        user_name=current_user.full_name,
        location_link=location_link,
        timestamp=timestamp_str,
        sms_text=message_text
    )

    return {
        "status": "triggered",
        "sos_id": new_sos.id,
        "source": sos.trigger_source,
        "recipient_contacts_count": len(contact_numbers),
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

    new_journey = models.Journey(
        user_id=current_user.id,
        start_location=journey.start_location,
        destination=journey.destination,
        emergency_contact_phone=journey.emergency_contact_phone,
        duration_minutes=journey.duration_minutes,
        license_plate=journey.license_plate,
        is_active=True
    )
    db.add(new_journey)
    db.commit()
    db.refresh(new_journey)

    # Queue out-of-band watchers notifications
    background_tasks.add_task(
        tasks.run_journey_start_task,
        recipient=journey.emergency_contact_phone,
        user_name=current_user.full_name,
        start_location=journey.start_location,
        destination=journey.destination,
        duration_minutes=journey.duration_minutes,
        license_plate=journey.license_plate or ""
    )

    return new_journey

@app.post("/journey/vehicle-photo")
async def upload_vehicle_photo(
    journey_id: int,
    photo: UploadFile = File(...),
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
    
    # Run Tesseract OCR extraction on raw bytes
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
