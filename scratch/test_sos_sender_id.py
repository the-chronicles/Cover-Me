import asyncio
import os
from dotenv import load_dotenv

# Load env variables from backend/.env
backend_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend/.env"))
load_dotenv(backend_env)

# Configure path so we can import app modules
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

from app.services.messaging import MessagingService

async def main():
    service = MessagingService()
    print("=== TESTING SENDER ID OVERRIDES ===")
    
    # 1. Test default OTP send (should use default sender ID, e.g., N-Alert)
    print("\n--- 1. Testing Default OTP Send ---")
    res_otp = await service.send_sms_via_termii("+2348030000000", "Your verification code is 123456. Expires in 5 mins. never walk alone.")
    
    # 2. Test SOS alert dispatch (should override to CoverMeNG)
    print("\n--- 2. Testing SOS Alert Dispatch (Override to CoverMeNG) ---")
    res_sos = await service.broadcast_sos_alerts(
        contacts=["+2348030000000"],
        user_name="John Doe",
        location_link="https://maps.google.com/?q=6.5244,3.3792",
        timestamp="2026-06-11 12:00:00"
    )
    print(f"SOS Alert Dispatch Results: {res_sos}")

if __name__ == "__main__":
    asyncio.run(main())
