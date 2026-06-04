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

    contacts = relationship("TrustedContact", back_populates="owner", cascade="all, delete-orphan")
    journeys = relationship("Journey", back_populates="user", cascade="all, delete-orphan")
    sos_alerts = relationship("SOSAlert", back_populates="user", cascade="all, delete-orphan")


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
    emergency_contact_phone = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    license_plate = Column(String, nullable=True)
    license_plate_photo_url = Column(String, nullable=True)
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
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    status = Column(String, default="active")           # active, resolved
    trigger_source = Column(String, default="button")   # button, voice, anomaly
    triggered_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sos_alerts")
