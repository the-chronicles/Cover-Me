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

def run_verification():
    print("=== STARTING SMS OTP FLOW VERIFICATION ===")
    client = httpx.Client(timeout=10.0)
    
    # Generate a unique phone number
    test_phone = f"+234803{int(time.time()) % 10000000:07d}"
    print(f"Test phone number: {test_phone}")
    
    # 1. Try registration without OTP code - should fail!
    email = f"otp_tester_{int(time.time())}@coverme.com"
    reg_payload = {
        "email": email,
        "password": "SecurePassword123",
        "full_name": "OTP Tester",
        "phone_number": test_phone
    }
    r_reg_fail = client.post(f"{BASE_URL}/register", json=reg_payload)
    print(f"Registration without OTP (should fail): status={r_reg_fail.status_code}, response={r_reg_fail.text}")
    assert r_reg_fail.status_code == 400
    assert "Phone number not verified" in r_reg_fail.json()["detail"]
    print("SUCCESS: Registration without OTP failed as expected!")
    
    # 2. Request OTP via /auth/send-otp
    r_send = client.post(f"{BASE_URL}/auth/send-otp", json={"phone_number": test_phone})
    print(f"Send OTP response: status={r_send.status_code}, response={r_send.json()}")
    assert r_send.status_code == 200
    
    # 3. Retrieve code from database
    otp_code = get_last_otp_from_db(test_phone)
    print(f"Retrieved OTP code from DB: {otp_code}")
    assert otp_code is not None, "Failed to retrieve OTP code from DB"
    
    # 4. Verify OTP (Login via OTP for non-existent user) - should return is_new_user = True
    r_verify_new = client.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone_number": test_phone,
        "otp_code": otp_code
    })
    print(f"Verify OTP for new user response: status={r_verify_new.status_code}, response={r_verify_new.json()}")
    assert r_verify_new.status_code == 200
    verify_data = r_verify_new.json()
    assert verify_data.get("is_new_user") is True
    assert verify_data.get("phone_number") == test_phone
    print("SUCCESS: OTP verification returned is_new_user=True correctly!")
    
    # 5. Register user (phone already verified in DB from step 4)
    r_reg_success = client.post(f"{BASE_URL}/register", json=reg_payload)
    print(f"Register with verified phone: status={r_reg_success.status_code}, response={r_reg_success.json()}")
    assert r_reg_success.status_code == 200
    print("SUCCESS: Registration after verification completed successfully!")
    
    # 6. Try duplicate registration - should fail
    r_reg_dup = client.post(f"{BASE_URL}/register", json=reg_payload)
    print(f"Duplicate registration (should fail): status={r_reg_dup.status_code}, response={r_reg_dup.text}")
    assert r_reg_dup.status_code == 400
    
    # 7. Request another OTP for passwordless login
    r_send_login = client.post(f"{BASE_URL}/auth/send-otp", json={"phone_number": test_phone})
    print(f"Send login OTP response: status={r_send_login.status_code}")
    assert r_send_login.status_code == 200
    
    login_otp = get_last_otp_from_db(test_phone)
    print(f"Retrieved login OTP from DB: {login_otp}")
    
    # 8. Verify OTP for existing user - should log them in (return tokens)
    r_verify_existing = client.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone_number": test_phone,
        "otp_code": login_otp
    })
    print(f"Verify OTP for existing user: status={r_verify_existing.status_code}")
    assert r_verify_existing.status_code == 200
    login_data = r_verify_existing.json()
    assert "access_token" in login_data
    assert "refresh_token" in login_data
    assert login_data["user"]["phone_number"] == test_phone
    print("SUCCESS: Passwordless login via OTP logged in user successfully!")
    
    # 9. Verify OTP with incorrect code - should fail
    r_verify_bad = client.post(f"{BASE_URL}/auth/verify-otp", json={
        "phone_number": test_phone,
        "otp_code": "000000"
    })
    print(f"Verify incorrect OTP (should fail): status={r_verify_bad.status_code}, response={r_verify_bad.text}")
    assert r_verify_bad.status_code == 400
    
    print("\n=== ALL SMS OTP FLOW TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_verification()
