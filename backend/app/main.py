import os
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import bcrypt
from jose import JWTError, jwt
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from .database.connection import Base, engine, get_db
from .database import models
from .services.messaging import MessagingService
from .services.ocr import extract_license_plate

# Create database tables (simple approach for MVP development)
Base.metadata.create_all(bind=engine)

messaging_service = MessagingService()

app = FastAPI(
    title="CoverMe API",
    description="Safety and location intelligence backend for Nigeria (SMS & WhatsApp Fallback layer)",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Setup
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "coverme-super-safety-secret-key-1092837")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 Hours

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
    token_type: str
    user: UserResponse

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

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(db: Session = Depends(get_db), token: str = Depends(lambda: None)):
    # Simple token extraction from Authorization header
    # Custom extraction to work easily with mobile client headers
    pass

# Helper to verify token and return user
async def get_authenticated_user(authorization: str, db: Session = Depends(get_db)) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == token_data.user_id).first()
    if user is None:
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
    
    access_token = create_access_token(data={"sub": user.id})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": user
    }

@app.post("/user/update", response_model=UserResponse)
def update_user(
    user_data: UserUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    user_id = 1
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
        except Exception:
            pass

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.phone_number is not None:
        user.phone_number = user_data.phone_number

    db.commit()
    db.refresh(user)
    return user

# Trusted Circle (Contacts)
@app.post("/contacts/add", response_model=ContactResponse)
def add_contact(
    contact: ContactCreate, 
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    # Simulated auth lookup or default to User ID 1 for testing simplicity if token missing
    user_id = 1
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
        except Exception:
            pass

    new_contact = models.TrustedContact(
        user_id=user_id,
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
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    user_id = 1
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
        except Exception:
            pass
            
    return db.query(models.TrustedContact).filter(models.TrustedContact.user_id == user_id).all()

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
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    # Retrieve user_id from auth token
    user_id = 1
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
        except Exception:
            pass

    # Log location updates to standard output (acting as location sync layer)
    print(f"[Location Sync] User {user_id} moved to Lat: {loc.lat}, Lng: {loc.lng}")
    
    # Check if user entered any geofenced security hotspot
    active_warning = None
    for hotspot in SECURITY_HOTSPOTS:
        dist = calculate_distance(loc.lat, loc.lng, hotspot["lat"], hotspot["lng"])
        if dist <= hotspot["radius_km"]:
            print(f"[GEOFENCE WARNING] User {user_id} entered hotspot: {hotspot['name']} (Distance: {dist:.2f}km)")
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
async def trigger_sos(
    sos: SOSTrigger,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    user_id = 1
    user_phone = "+2348000000000"
    user_name = "CoverMe User"
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user_phone = user.phone_number
                user_name = user.full_name
        except Exception:
            pass

    # Record the SOS in the database
    new_sos = models.SOSAlert(
        user_id=user_id,
        location_lat=sos.location_lat,
        location_lng=sos.location_lng,
        trigger_source=sos.trigger_source,
        status="active"
    )
    db.add(new_sos)
    db.commit()

    # Query User's Trusted Contacts
    contacts = db.query(models.TrustedContact).filter(models.TrustedContact.user_id == user_id).all()
    contact_numbers = [c.phone_number for c in contacts]

    # Build safety alert template
    coordinates = f"{sos.location_lat},{sos.location_lng}" if (sos.location_lat and sos.location_lng) else "Unknown Coordinates"
    message_text = f"EMERGENCY! {user_name} ({user_phone}) triggered SOS at location: https://maps.google.com/?q={coordinates}. Never walk alone."
    
    # Broadcast alerts via real Termii SMS and WhatsApp Cloud APIs
    broadcast_results = await messaging_service.broadcast_sos_alerts(contact_numbers, message_text)

    return {
        "status": "triggered",
        "sos_id": new_sos.id,
        "source": sos.trigger_source,
        "recipient_contacts_count": len(contact_numbers),
        "broadcast_results": broadcast_results,
        "fallback_payload": {
            "message": message_text,
            "contacts": contact_numbers
        }
    }

@app.post("/sos/voice-trigger")
async def trigger_sos_voice(
    sos: SOSTrigger,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    sos.trigger_source = "voice"
    return await trigger_sos(sos=sos, authorization=authorization, db=db)

# Follow Me Journey tracking
@app.post("/journey/start", response_model=JourneyResponse)
async def start_journey(
    journey: JourneyStart,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    user_id = 1
    if authorization:
        try:
            payload = jwt.decode(authorization.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub", 1)
        except Exception:
            pass

    # Deactivate existing active journeys for this user
    db.query(models.Journey).filter(
        models.Journey.user_id == user_id, 
        models.Journey.is_active == True
    ).update({"is_active": False})

    new_journey = models.Journey(
        user_id=user_id,
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

    # Compose start notification message
    user_name = "CoverMe User"
    user_phone = "+2348000000000"
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        user_name = user.full_name
        user_phone = user.phone_number

    plate_info = f" in vehicle {journey.license_plate}" if journey.license_plate else ""
    start_message = (
        f"CoverMe Security Alert: {user_name} ({user_phone}) has initiated a Follow Me journey from "
        f"{journey.start_location} to {journey.destination}{plate_info}. Estimated duration: {journey.duration_minutes} mins. "
        f"Slogan: never walk alone."
    )

    # Broadcast trip start notification to the emergency contact
    print(f"[Watcher Notify] Alerting emergency contact: {journey.emergency_contact_phone}")
    await messaging_service.send_sms_via_termii(journey.emergency_contact_phone, start_message)
    await messaging_service.send_whatsapp_via_meta(journey.emergency_contact_phone, start_message)

    return new_journey

@app.post("/journey/vehicle-photo")
async def upload_vehicle_photo(
    journey_id: int,
    photo: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    # Find the journey
    journey = db.query(models.Journey).filter(models.Journey.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Journey not found")
        
    # Read photo file bytes
    photo_bytes = await photo.read()
    
    # Run Tesseract OCR extraction on raw bytes
    detected_plate = extract_license_plate(photo_bytes)
    
    mock_url = f"https://storage.coverme.ng/photos/vehicle_{journey_id}.jpg"
    journey.license_plate_photo_url = mock_url
    journey.license_plate = detected_plate
        
    db.commit()
    db.refresh(journey)
    return {
        "status": "success",
        "url": mock_url,
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
    query = db.query(models.EmergencyCommandLine)
    if state:
        query = query.filter(models.EmergencyCommandLine.state.ilike(state))
    if lga:
        query = query.filter(models.EmergencyCommandLine.lga.ilike(lga))
    if facility_type:
        query = query.filter(models.EmergencyCommandLine.facility_type == facility_type)
        
    return query.all()
