import json
import datetime
from typing import List
from sqlalchemy.orm import Session
from ..database.connection import get_db
from ..database import models
from .messaging import MessagingService

messaging_service = MessagingService()

async def run_sos_delivery_task(
    sos_id: int,
    contacts: List[str],
    user_name: str,
    location_link: str,
    timestamp: str,
    sms_text: str
):
    """
    Asynchronously executes the SOS delivery chain:
    1. Firebase FCM Push Notification (Stubbed/Simulated)
    2. Termii SMS Gateway
    3. Meta WhatsApp (Template + text fallback)
    Every attempt is audited and written to the database in SOSDeliveryLog.
    """
    # Open a fresh database session inside the task to prevent closed session errors
    db: Session = next(get_db())
    try:
        # Verify SOS Alert exists
        sos_alert = db.query(models.SOSAlert).filter(models.SOSAlert.id == sos_id).first()
        if not sos_alert:
            print(f"[Async Task Error] SOS Alert {sos_id} not found in database.")
            return

        # ----------------------------------------------------
        # 1. FCM Push Notifications (In-app real-time)
        # ----------------------------------------------------
        print(f"[SOS Queue] Step 1/3: Triggering Push alerts for {len(contacts)} contacts...")
        for contact in contacts:
            # Create a log entry for FCM
            fcm_log = models.SOSDeliveryLog(
                sos_id=sos_id,
                channel="fcm",
                recipient=contact,
                status="pending",
                attempt=1
            )
            db.add(fcm_log)
            db.commit()
            db.refresh(fcm_log)

            try:
                # Simulated Firebase Push Alert (No SDK setup yet)
                fcm_response = {"status": "success", "info": "Push notification sent via mock FCM client."}
                fcm_log.status = "sent"
                fcm_log.raw_api_response = json.dumps(fcm_response)
            except Exception as ex:
                fcm_log.status = "failed"
                fcm_log.error_message = str(ex)
            db.commit()

        # ----------------------------------------------------
        # 2. Termii SMS Broadcast
        # ----------------------------------------------------
        print(f"[SOS Queue] Step 2/3: Dispatching SMS via Termii...")
        for contact in contacts:
            sms_log = models.SOSDeliveryLog(
                sos_id=sos_id,
                channel="sms",
                recipient=contact,
                status="pending",
                attempt=1
            )
            db.add(sms_log)
            db.commit()
            db.refresh(sms_log)

            try:
                sms_res = await messaging_service.send_sms_via_termii(contact, sms_text, sender_id="CoverMeNG")
                sms_log.status = "sent" if sms_res.get("status") in ("success", "simulated") else "failed"
                sms_log.raw_api_response = json.dumps(sms_res.get("data", sms_res))
                if sms_log.status == "failed":
                    sms_log.error_message = sms_res.get("error", "Failed to deliver SMS via Termii.")
            except Exception as ex:
                sms_log.status = "failed"
                sms_log.error_message = str(ex)
            db.commit()

        # ----------------------------------------------------
        # 3. Meta WhatsApp Template Broadcast
        # ----------------------------------------------------
        print(f"[SOS Queue] Step 3/3: Dispatching WhatsApp template alerts...")
        for contact in contacts:
            wa_log = models.SOSDeliveryLog(
                sos_id=sos_id,
                channel="whatsapp",
                recipient=contact,
                status="pending",
                attempt=1
            )
            db.add(wa_log)
            db.commit()
            db.refresh(wa_log)

            try:
                wa_res = await messaging_service.send_whatsapp_template_via_meta(
                    recipient=contact,
                    template_name="sos_alert",
                    parameters=[user_name, location_link, timestamp],
                    fallback_text=sms_text
                )
                
                # Check status
                status_res = wa_res.get("status")
                if status_res in ("success", "success_via_template_fallback", "success_via_text_fallback", "simulated"):
                    wa_log.status = "sent"
                else:
                    wa_log.status = "failed"
                    wa_log.error_message = wa_res.get("error", "Failed to deliver WhatsApp alert.")
                
                wa_log.raw_api_response = json.dumps(wa_res.get("data", wa_res))
            except Exception as ex:
                wa_log.status = "failed"
                wa_log.error_message = str(ex)
            db.commit()

        # Update SOS Alert status to resolved or processed
        print(f"[SOS Queue] Completed delivery chain for SOS {sos_id}.")

    except Exception as e:
        print(f"[Async Task Critical Error] Failed in running SOS task: {e}")
    finally:
        db.close()


async def run_journey_start_task(
    recipient: str,
    user_name: str,
    start_location: str,
    destination: str,
    duration_minutes: int,
    license_plate: str
):
    """
    Asynchronously alerts an emergency contact when a journey starts.
    SMS and WhatsApp notifications are dispatched out-of-band.
    """
    # Compile notification messages
    plate_info = f" in vehicle {license_plate}" if license_plate else ""
    start_message = (
        f"CoverMe Security Alert: {user_name} has initiated a Follow Me journey from "
        f"{start_location} to {destination}{plate_info}. Estimated duration: {duration_minutes} mins. "
        f"Slogan: never walk alone."
    )
    
    print(f"[Journey Queue] Alerting emergency contact: {recipient}")
    # Dispatch SMS
    await messaging_service.send_sms_via_termii(recipient, start_message, sender_id="CoverMeNG")
    # Dispatch WhatsApp
    await messaging_service.send_whatsapp_template_via_meta(
        recipient=recipient,
        template_name="safe_checkin",
        parameters=[
            user_name,
            start_location,
            destination,
            str(duration_minutes)
        ],
        fallback_text=start_message
    )
