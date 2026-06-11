import time
import httpx
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load env variables from backend/.env
backend_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend/.env"))
load_dotenv(backend_env)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://chronicles@localhost:5432/coverme_db")
BASE_URL = "http://localhost:8000"

def get_last_otp_from_db(phone_number):
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        query = text("SELECT otp_code FROM otp_verifications WHERE phone_number = :phone ORDER BY id DESC LIMIT 1")
        result = conn.execute(query, {"phone": phone_number}).fetchone()
        if result:
            return result[0]
    return None

def run_tests():
    print("=== STARTING NEW ENDPOINTS VERIFICATION ===")
    client = httpx.Client(timeout=10.0)
    
    # 1. Connect to backend
    try:
        r_root = client.get(f"{BASE_URL}/")
        print(f"[1] Root endpoint response: {r_root.status_code} - {r_root.json()}")
    except Exception as e:
        print(f"[ERROR] Could not connect to backend at {BASE_URL}: {e}")
        return
        
    # 2. Register a new user with OTP
    email = f"test_user_{int(time.time())}@coverme.com"
    phone_number = f"+234803{int(time.time()) % 10000000:07d}"
    
    # Request OTP
    r_send = client.post(f"{BASE_URL}/auth/send-otp", json={"phone_number": phone_number})
    assert r_send.status_code == 200, "Send OTP failed"
    
    # Retrieve OTP code
    otp_code = get_last_otp_from_db(phone_number)
    assert otp_code is not None, "Failed to retrieve OTP code from DB"
    
    # Verify OTP
    r_verify = client.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone_number": phone_number,
        "otp_code": otp_code
    })
    assert r_verify.status_code == 200, "Verify OTP failed"
    
    reg_payload = {
        "email": email,
        "password": "SecurePassword123",
        "full_name": "Active Session Tester",
        "phone_number": phone_number
    }
    r_reg = client.post(f"{BASE_URL}/register", json=reg_payload)
    print(f"[2] Registration response: {r_reg.status_code}")
    assert r_reg.status_code == 200, "Registration failed"
    
    # 3. Login
    login_payload = {
        "email": email,
        "password": "SecurePassword123"
    }
    r_login = client.post(f"{BASE_URL}/login", json=login_payload)
    print(f"[3] Login response: {r_login.status_code}")
    assert r_login.status_code == 200, "Login failed"
    token_data = r_login.json()
    access_token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # 4. Check active SOS (should be null/empty)
    r_active_sos_1 = client.get(f"{BASE_URL}/sos/active", headers=headers)
    print(f"[4] Initial Active SOS (should be null): {r_active_sos_1.status_code} - {r_active_sos_1.json()}")
    assert r_active_sos_1.status_code == 200, "Initial active SOS check failed"
    assert r_active_sos_1.json() is None, "Expected no active SOS at start"
    
    # 5. Trigger SOS
    sos_payload = {
        "location_lat": 6.5244,
        "location_lng": 3.3792,
        "trigger_source": "button"
    }
    r_trigger_sos = client.post(f"{BASE_URL}/sos/trigger", json=sos_payload, headers=headers)
    print(f"[5] Trigger SOS response: {r_trigger_sos.status_code} - {r_trigger_sos.json()}")
    assert r_trigger_sos.status_code == 200, "Triggering SOS failed"
    
    # 6. Check active SOS again (should NOT be null)
    r_active_sos_2 = client.get(f"{BASE_URL}/sos/active", headers=headers)
    print(f"[6] Active SOS after trigger (should not be null): {r_active_sos_2.status_code} - {r_active_sos_2.json()}")
    assert r_active_sos_2.status_code == 200, "Active SOS check after trigger failed"
    assert r_active_sos_2.json() is not None, "Expected active SOS details"
    assert r_active_sos_2.json()["status"] == "active", "Expected SOS status to be active"
    
    # 7. Resolve SOS
    r_resolve_sos = client.post(f"{BASE_URL}/sos/resolve", headers=headers)
    print(f"[7] Resolve SOS response: {r_resolve_sos.status_code} - {r_resolve_sos.json()}")
    assert r_resolve_sos.status_code == 200, "Resolving SOS failed"
    
    # 8. Check active SOS again (should be null/empty)
    r_active_sos_3 = client.get(f"{BASE_URL}/sos/active", headers=headers)
    print(f"[8] Active SOS after resolution (should be null): {r_active_sos_3.status_code} - {r_active_sos_3.json()}")
    assert r_active_sos_3.status_code == 200, "Active SOS check after resolution failed"
    assert r_active_sos_3.json() is None, "Expected no active SOS after resolution"
    
    # 9. Check active journey (should be null/empty)
    r_active_journey_1 = client.get(f"{BASE_URL}/journey/my-active", headers=headers)
    print(f"[9] Initial Active Journey (should be null): {r_active_journey_1.status_code} - {r_active_journey_1.json()}")
    assert r_active_journey_1.status_code == 200, "Initial active journey check failed"
    assert r_active_journey_1.json() is None, "Expected no active journey at start"
    
    # 10. Start journey
    journey_payload = {
        "start_location": "Ikeja, Lagos",
        "destination": "Lekki, Lagos",
        "emergency_contact_phone": "+2348099999999",
        "duration_minutes": 60,
        "license_plate": "ABC-123-XY",
        "watcher_type": None,
        "watcher_id": None
    }
    r_start_journey = client.post(f"{BASE_URL}/journey/start", json=journey_payload, headers=headers)
    print(f"[10] Start journey response: {r_start_journey.status_code} - {r_start_journey.json()}")
    assert r_start_journey.status_code == 200, "Starting journey failed"
    
    # 11. Check active journey again (should NOT be null)
    r_active_journey_2 = client.get(f"{BASE_URL}/journey/my-active", headers=headers)
    print(f"[11] Active Journey after start (should not be null): {r_active_journey_2.status_code} - {r_active_journey_2.json()}")
    assert r_active_journey_2.status_code == 200, "Active journey check after start failed"
    assert r_active_journey_2.json() is not None, "Expected active journey details"
    assert r_active_journey_2.json()["is_active"] is True, "Expected journey to be active"
    
    # 12. End journey
    r_end_journey = client.post(f"{BASE_URL}/journey/end", headers=headers)
    print(f"[12] End journey response: {r_end_journey.status_code} - {r_end_journey.json()}")
    assert r_end_journey.status_code == 200, "Ending journey failed"
    
    # 13. Check active journey again (should be null/empty)
    r_active_journey_3 = client.get(f"{BASE_URL}/journey/my-active", headers=headers)
    print(f"[13] Active Journey after ending (should be null): {r_active_journey_3.status_code} - {r_active_journey_3.json()}")
    assert r_active_journey_3.status_code == 200, "Active journey check after ending failed"
    assert r_active_journey_3.json() is None, "Expected no active journey after ending"
    
    print("\n=== ALL ENDPOINTS SUCCESSFULLY VERIFIED ===")

if __name__ == "__main__":
    run_tests()
