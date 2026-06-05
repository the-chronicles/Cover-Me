"""
CoverMe Admin Dashboard
========================
Built-in password-protected admin panel using SQLAdmin.
Access at: /admin
"""

import os
import bcrypt
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend, login_required
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request

from .database import models
from .database.connection import engine, SessionLocal


# ─── Admin Authentication Backend ────────────────────────────────────────────

# Admin credentials from environment (defaults for development only)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", os.getenv("JWT_SECRET_KEY", "coverme-admin-secret-key-dev"))

# If no hashed password is set, hash the default dev password "coverme2026"
if not ADMIN_PASSWORD_HASH:
    _default_pwd = os.getenv("ADMIN_PASSWORD", "coverme2026")
    ADMIN_PASSWORD_HASH = bcrypt.hashpw(_default_pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


class CoverMeAdminAuth(AuthenticationBackend):
    """Session-based authentication for the admin panel."""

    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = form.get("username", "")
        password = form.get("password", "")

        if username == ADMIN_USERNAME and bcrypt.checkpw(
            password.encode("utf-8"), ADMIN_PASSWORD_HASH.encode("utf-8")
        ):
            request.session.update({"admin_authenticated": True, "admin_user": username})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("admin_authenticated", False)


# ─── Model Views ─────────────────────────────────────────────────────────────

class UserAdmin(ModelView, model=models.User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-users"

    column_list = [
        models.User.id,
        models.User.full_name,
        models.User.email,
        models.User.phone_number,
        models.User.created_at,
    ]
    column_searchable_list = [models.User.full_name, models.User.email, models.User.phone_number]
    column_sortable_list = [models.User.id, models.User.full_name, models.User.created_at]
    column_default_sort = (models.User.created_at, True)  # newest first

    # Hide the hashed password from detail view and forms
    column_details_exclude_list = [models.User.hashed_password]
    form_excluded_columns = [models.User.hashed_password, models.User.refresh_tokens]

    can_create = False  # Users register through the mobile app
    can_delete = True
    can_edit = True


class TrustedContactAdmin(ModelView, model=models.TrustedContact):
    name = "Trusted Contact"
    name_plural = "Trusted Contacts"
    icon = "fa-solid fa-address-book"

    column_list = [
        models.TrustedContact.id,
        models.TrustedContact.name,
        models.TrustedContact.phone_number,
        models.TrustedContact.relation,
        models.TrustedContact.user_id,
    ]
    column_searchable_list = [models.TrustedContact.name, models.TrustedContact.phone_number]
    column_sortable_list = [models.TrustedContact.id, models.TrustedContact.name]

    can_create = True
    can_delete = True
    can_edit = True


class JourneyAdmin(ModelView, model=models.Journey):
    name = "Journey"
    name_plural = "Journeys"
    icon = "fa-solid fa-route"

    column_list = [
        models.Journey.id,
        models.Journey.user_id,
        models.Journey.start_location,
        models.Journey.destination,
        models.Journey.emergency_contact_phone,
        models.Journey.duration_minutes,
        models.Journey.license_plate,
        models.Journey.is_active,
        models.Journey.started_at,
    ]
    column_searchable_list = [
        models.Journey.start_location,
        models.Journey.destination,
        models.Journey.license_plate,
    ]
    column_sortable_list = [
        models.Journey.id,
        models.Journey.started_at,
        models.Journey.is_active,
    ]
    column_default_sort = (models.Journey.started_at, True)

    can_create = False
    can_delete = True
    can_edit = True


class SOSAlertAdmin(ModelView, model=models.SOSAlert):
    name = "SOS Alert"
    name_plural = "SOS Alerts"
    icon = "fa-solid fa-triangle-exclamation"

    column_list = [
        models.SOSAlert.id,
        models.SOSAlert.user_id,
        models.SOSAlert.status,
        models.SOSAlert.trigger_source,
        models.SOSAlert.triggered_at,
    ]
    # Don't display encrypted location columns in list view
    column_details_list = [
        models.SOSAlert.id,
        models.SOSAlert.user_id,
        models.SOSAlert.location_lat,
        models.SOSAlert.location_lng,
        models.SOSAlert.status,
        models.SOSAlert.trigger_source,
        models.SOSAlert.triggered_at,
    ]
    column_searchable_list = [models.SOSAlert.status, models.SOSAlert.trigger_source]
    column_sortable_list = [
        models.SOSAlert.id,
        models.SOSAlert.triggered_at,
        models.SOSAlert.status,
    ]
    column_default_sort = (models.SOSAlert.triggered_at, True)

    column_labels = {
        models.SOSAlert.location_lat: "Location Lat (Encrypted)",
        models.SOSAlert.location_lng: "Location Lng (Encrypted)",
        models.SOSAlert.trigger_source: "Trigger Source",
    }

    can_create = False
    can_delete = True
    can_edit = True  # Allow resolving SOS status


class SOSDeliveryLogAdmin(ModelView, model=models.SOSDeliveryLog):
    name = "Delivery Log"
    name_plural = "Delivery Logs"
    icon = "fa-solid fa-paper-plane"

    column_list = [
        models.SOSDeliveryLog.id,
        models.SOSDeliveryLog.sos_id,
        models.SOSDeliveryLog.channel,
        models.SOSDeliveryLog.recipient,
        models.SOSDeliveryLog.status,
        models.SOSDeliveryLog.attempt,
        models.SOSDeliveryLog.created_at,
    ]
    column_details_list = [
        models.SOSDeliveryLog.id,
        models.SOSDeliveryLog.sos_id,
        models.SOSDeliveryLog.channel,
        models.SOSDeliveryLog.recipient,
        models.SOSDeliveryLog.status,
        models.SOSDeliveryLog.attempt,
        models.SOSDeliveryLog.error_message,
        models.SOSDeliveryLog.raw_api_response,
        models.SOSDeliveryLog.created_at,
    ]
    column_searchable_list = [
        models.SOSDeliveryLog.channel,
        models.SOSDeliveryLog.recipient,
        models.SOSDeliveryLog.status,
    ]
    column_sortable_list = [
        models.SOSDeliveryLog.id,
        models.SOSDeliveryLog.created_at,
        models.SOSDeliveryLog.status,
    ]
    column_default_sort = (models.SOSDeliveryLog.created_at, True)

    column_labels = {
        models.SOSDeliveryLog.raw_api_response: "Raw API Response",
        models.SOSDeliveryLog.error_message: "Error Message",
    }

    can_create = False
    can_delete = False  # Audit logs must not be deletable
    can_edit = False    # Read-only audit trail


class EmergencyCommandLineAdmin(ModelView, model=models.EmergencyCommandLine):
    name = "Command Line"
    name_plural = "Emergency Command Lines"
    icon = "fa-solid fa-phone-volume"

    column_list = [
        models.EmergencyCommandLine.id,
        models.EmergencyCommandLine.state,
        models.EmergencyCommandLine.lga,
        models.EmergencyCommandLine.facility_name,
        models.EmergencyCommandLine.facility_type,
        models.EmergencyCommandLine.phone_number,
    ]
    column_searchable_list = [
        models.EmergencyCommandLine.state,
        models.EmergencyCommandLine.lga,
        models.EmergencyCommandLine.facility_name,
        models.EmergencyCommandLine.phone_number,
    ]
    column_sortable_list = [
        models.EmergencyCommandLine.id,
        models.EmergencyCommandLine.state,
        models.EmergencyCommandLine.facility_type,
    ]
    column_default_sort = (models.EmergencyCommandLine.state, False)

    can_create = True   # Admins can add new emergency numbers
    can_delete = True
    can_edit = True


class RefreshTokenAdmin(ModelView, model=models.RefreshToken):
    name = "Refresh Token"
    name_plural = "Refresh Tokens"
    icon = "fa-solid fa-key"

    column_list = [
        models.RefreshToken.id,
        models.RefreshToken.user_id,
        models.RefreshToken.revoked,
        models.RefreshToken.expires_at,
        models.RefreshToken.created_at,
    ]
    # Don't show the raw hashed token in list view
    column_details_exclude_list = [models.RefreshToken.token]
    column_sortable_list = [
        models.RefreshToken.id,
        models.RefreshToken.created_at,
        models.RefreshToken.revoked,
    ]
    column_default_sort = (models.RefreshToken.created_at, True)

    column_labels = {
        models.RefreshToken.revoked: "Revoked?",
    }

    can_create = False
    can_delete = True  # Admin can clean up expired/revoked tokens
    can_edit = True    # Admin can manually revoke tokens


class AdminNotificationAdmin(ModelView, model=models.AdminNotification):
    name = "Admin Notification"
    name_plural = "Admin Notifications"
    icon = "fa-solid fa-bell"

    column_list = [
        models.AdminNotification.id,
        models.AdminNotification.message,
        models.AdminNotification.read,
        models.AdminNotification.created_at,
    ]
    column_searchable_list = [models.AdminNotification.message]
    column_sortable_list = [models.AdminNotification.id, models.AdminNotification.created_at]
    column_default_sort = (models.AdminNotification.created_at, True)

    can_create = False
    can_delete = True
    can_edit = True


# ─── Custom Admin with Dashboard Stats ────────────────────────────────────────

import datetime as _dt
from pathlib import Path
from sqlalchemy import func as sa_func
from starlette.responses import Response

# Path to custom templates (project_root/templates/)
TEMPLATES_DIR = str(Path(__file__).resolve().parent.parent / "templates")


class CoverMeAdmin(Admin):
    """Custom Admin subclass with a rich dashboard index page."""

    @login_required
    async def index(self, request: Request) -> Response:
        """Override the default blank index to show a live stats dashboard."""
        db = SessionLocal()
        try:
            now = _dt.datetime.utcnow()

            # ── Core Counts ──
            total_users = db.query(sa_func.count(models.User.id)).scalar() or 0
            active_journeys = db.query(sa_func.count(models.Journey.id)).filter(
                models.Journey.is_active == True
            ).scalar() or 0
            total_sos = db.query(sa_func.count(models.SOSAlert.id)).scalar() or 0
            active_sos = db.query(sa_func.count(models.SOSAlert.id)).filter(
                models.SOSAlert.status == "active"
            ).scalar() or 0

            # ── Delivery Stats ──
            total_deliveries = db.query(sa_func.count(models.SOSDeliveryLog.id)).scalar() or 0
            sent_deliveries = db.query(sa_func.count(models.SOSDeliveryLog.id)).filter(
                models.SOSDeliveryLog.status == "sent"
            ).scalar() or 0
            delivery_rate = round((sent_deliveries / total_deliveries * 100) if total_deliveries > 0 else 0, 1)

            # ── Channel Breakdown ──
            channel_breakdown = []
            channels = db.query(
                models.SOSDeliveryLog.channel,
                sa_func.count(models.SOSDeliveryLog.id).label("total"),
                sa_func.count(
                    sa_func.nullif(models.SOSDeliveryLog.status != "sent", True)
                ).label("sent_count"),
            ).group_by(models.SOSDeliveryLog.channel).all()

            for ch in channels:
                ch_total = ch.total or 0
                ch_sent = db.query(sa_func.count(models.SOSDeliveryLog.id)).filter(
                    models.SOSDeliveryLog.channel == ch.channel,
                    models.SOSDeliveryLog.status == "sent"
                ).scalar() or 0
                ch_rate = round((ch_sent / ch_total * 100) if ch_total > 0 else 0, 1)
                channel_breakdown.append({
                    "name": ch.channel,
                    "total": ch_total,
                    "sent": ch_sent,
                    "rate": ch_rate,
                })

            # ── Recent SOS Alerts (last 10) ──
            recent_sos_rows = db.query(models.SOSAlert).order_by(
                models.SOSAlert.triggered_at.desc()
            ).limit(10).all()

            recent_sos = []
            for alert in recent_sos_rows:
                user = db.query(models.User).filter(models.User.id == alert.user_id).first()
                recent_sos.append({
                    "id": alert.id,
                    "user_name": user.full_name if user else "Deleted User",
                    "trigger_source": alert.trigger_source,
                    "status": alert.status,
                    "triggered_at": alert.triggered_at,
                })

            # ── Emergency Command Lines Breakdown ──
            total_command_lines = db.query(sa_func.count(models.EmergencyCommandLine.id)).scalar() or 0
            police_count = db.query(sa_func.count(models.EmergencyCommandLine.id)).filter(
                models.EmergencyCommandLine.facility_type == "police"
            ).scalar() or 0
            hospital_count = db.query(sa_func.count(models.EmergencyCommandLine.id)).filter(
                models.EmergencyCommandLine.facility_type == "hospital"
            ).scalar() or 0
            fire_count = db.query(sa_func.count(models.EmergencyCommandLine.id)).filter(
                models.EmergencyCommandLine.facility_type == "fire"
            ).scalar() or 0
            states_count = db.query(sa_func.count(sa_func.distinct(models.EmergencyCommandLine.state))).scalar() or 0

            # ── Session Token Stats ──
            active_sessions = db.query(sa_func.count(models.RefreshToken.id)).filter(
                models.RefreshToken.revoked == False,
                models.RefreshToken.expires_at > now,
            ).scalar() or 0
            revoked_sessions = db.query(sa_func.count(models.RefreshToken.id)).filter(
                models.RefreshToken.revoked == True,
            ).scalar() or 0
            expired_sessions = db.query(sa_func.count(models.RefreshToken.id)).filter(
                models.RefreshToken.revoked == False,
                models.RefreshToken.expires_at <= now,
            ).scalar() or 0

            # ── Recent System Notifications (last 5) ──
            recent_notifications = db.query(models.AdminNotification).order_by(
                models.AdminNotification.created_at.desc()
            ).limit(5).all()

        finally:
            db.close()

        stats = {
            "total_users": total_users,
            "active_journeys": active_journeys,
            "total_sos": total_sos,
            "active_sos": active_sos,
            "total_deliveries": total_deliveries,
            "sent_deliveries": sent_deliveries,
            "delivery_rate": delivery_rate,
            "channel_breakdown": channel_breakdown,
            "recent_sos": recent_sos,
            "total_command_lines": total_command_lines,
            "police_count": police_count,
            "hospital_count": hospital_count,
            "fire_count": fire_count,
            "states_count": states_count,
            "active_sessions": active_sessions,
            "revoked_sessions": revoked_sessions,
            "expired_sessions": expired_sessions,
            "recent_notifications": [
                {
                    "id": n.id,
                    "message": n.message,
                    "created_at": n.created_at,
                    "read": n.read
                } for n in recent_notifications
            ]
        }

        return await self.templates.TemplateResponse(
            request,
            "sqladmin/index.html",
            context={"stats": stats},
        )


# ─── Admin Setup Function ────────────────────────────────────────────────────

def setup_admin(app):
    """
    Mount the SQLAdmin dashboard onto the FastAPI application.
    Call this in main.py after creating the FastAPI app instance.
    """
    # Add session middleware (required by SQLAdmin auth)
    app.add_middleware(SessionMiddleware, secret_key=ADMIN_SECRET_KEY)

    # Create authentication backend
    auth_backend = CoverMeAdminAuth(secret_key=ADMIN_SECRET_KEY)

    # Initialize Admin with custom branding and custom templates directory
    admin = CoverMeAdmin(
        app,
        engine,
        authentication_backend=auth_backend,
        title="CoverMe Admin",
        base_url="/admin",
        templates_dir=TEMPLATES_DIR,
    )

    # Register all model views
    admin.add_view(UserAdmin)
    admin.add_view(TrustedContactAdmin)
    admin.add_view(JourneyAdmin)
    admin.add_view(SOSAlertAdmin)
    admin.add_view(SOSDeliveryLogAdmin)
    admin.add_view(EmergencyCommandLineAdmin)
    admin.add_view(RefreshTokenAdmin)
    admin.add_view(AdminNotificationAdmin)

    return admin

