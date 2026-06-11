import datetime
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    location_updated_at = Column(DateTime, nullable=True)
    push_token = Column(String, nullable=True)

    contacts = relationship("TrustedContact", back_populates="owner", cascade="all, delete-orphan")
    journeys = relationship("Journey", back_populates="user", cascade="all, delete-orphan")
    sos_alerts = relationship("SOSAlert", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    circle_memberships = relationship("CircleMember", back_populates="user", cascade="all, delete-orphan")


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    relation = Column(String, nullable=True)

    owner = relationship("User", back_populates="contacts")


class Journey(Base):
    __tablename__ = "journeys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_location = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    emergency_contact_phone = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    license_plate = Column(String, nullable=True)
    license_plate_photo_url = Column(String, nullable=True)
    watcher_type = Column(String, nullable=True) # member or circle
    watcher_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="journeys")


class EmergencyCommandLine(Base):
    __tablename__ = "emergency_command_lines"

    id = Column(Integer, primary_key=True, index=True)
    state = Column(String, nullable=False, index=True)  # Lagos, Oyo, Ondo, Ogun, Osun
    lga = Column(String, nullable=False, index=True)    # Local Government Area
    facility_name = Column(String, nullable=False)      # e.g. Ikeja Division Police HQ
    facility_type = Column(String, nullable=False)      # police, hospital, fire
    phone_number = Column(String, nullable=False)       # Direct GSM number


class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    location_lat = Column(String, nullable=True) # Encrypted location data (symmetric string token)
    location_lng = Column(String, nullable=True) # Encrypted location data (symmetric string token)
    status = Column(String, default="active")           # active, resolved
    trigger_source = Column(String, default="button")   # button, voice, anomaly
    triggered_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sos_alerts")
    delivery_logs = relationship("SOSDeliveryLog", back_populates="sos_alert", cascade="all, delete-orphan")


class SOSDeliveryLog(Base):
    __tablename__ = "sos_delivery_logs"

    id = Column(Integer, primary_key=True, index=True)
    sos_id = Column(Integer, ForeignKey("sos_alerts.id", ondelete="CASCADE"), nullable=False)
    channel = Column(String, nullable=False)            # sms, whatsapp, fcm
    recipient = Column(String, nullable=False)          # phone number or device fcm token
    status = Column(String, default="pending")          # pending, sent, delivered, failed
    attempt = Column(Integer, default=1)
    error_message = Column(String, nullable=True)
    raw_api_response = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sos_alert = relationship("SOSAlert", back_populates="delivery_logs")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False) # Hashed token
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="refresh_tokens")


class AdminNotification(Base):
    __tablename__ = "admin_notifications"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    read = Column(Boolean, default=False)


class Circle(Base):
    __tablename__ = "circles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    invite_code = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    members = relationship("CircleMember", back_populates="circle", cascade="all, delete-orphan")


class CircleMember(Base):
    __tablename__ = "circle_members"

    id = Column(Integer, primary_key=True, index=True)
    circle_id = Column(Integer, ForeignKey("circles.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    circle = relationship("Circle", back_populates="members")
    user = relationship("User", back_populates="circle_memberships")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False) # circle_join, sos_alert, journey_start, circle_invite
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String, index=True, nullable=False)
    otp_code = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

