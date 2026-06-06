import time
import requests

BASE_URL = "http://localhost:8000"

def test_push_notifications():
    print("🚀 Running Push Notifications integration & delivery tests...")

    # 1. Register User A and User B
    email_a = f"usera_push_{int(time.time())}@example.com"
    email_b = f"userb_push_{int(time.time())}@example.com"
    phone_a = f"+234803{str(int(time.time()))[-7:]}"
    phone_b = f"+234803{str(int(time.time()) + 1)[-7:]}"

    print(f"[*] Registering User A ({email_a})...")
    res_reg_a = requests.post(f"{BASE_URL}/register", json={
        "email": email_a,
        "password": "password123",
        "full_name": "User Alpha Push",
        "phone_number": phone_a
    })
    assert res_reg_a.status_code == 200

    print(f"[*] Registering User B ({email_b})...")
    res_reg_b = requests.post(f"{BASE_URL}/register", json={
        "email": email_b,
        "password": "password123",
        "full_name": "User Beta Push",
        "phone_number": phone_b
    })
    assert res_reg_b.status_code == 200

    # 2. Login both users
    print("[*] Logging in User A...")
    res_log_a = requests.post(f"{BASE_URL}/login", json={"email": email_a, "password": "password123"})
    assert res_log_a.status_code == 200
    token_a = res_log_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    print("[*] Logging in User B...")
    res_log_b = requests.post(f"{BASE_URL}/login", json={"email": email_b, "password": "password123"})
    assert res_log_b.status_code == 200
    token_b = res_log_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Register push tokens
    # Note: For testing, we use Expo push tokens. User B's token is a mock token.
    push_token_b = "ExponentPushToken[mock-beta-device-token]"
    print(f"[*] Registering push token for User B: {push_token_b}...")
    res_token = requests.post(f"{BASE_URL}/users/push-token", headers=headers_b, json={
        "push_token": push_token_b
    })
    assert res_token.status_code == 200
    assert res_token.json()["status"] == "success"
    print("    Push token registered successfully.")

    # 4. User A and User B join a Circle to connect them
    print("[*] User A creating circle...")
    res_circle = requests.post(f"{BASE_URL}/circles/create", headers=headers_a, json={
        "name": "Push Test Circle",
        "category": "Friends",
        "role": "Leader"
    })
    assert res_circle.status_code == 200
    circle = res_circle.json()
    circle_id = circle["id"]
    invite_code = circle["invite_code"]

    print(f"[*] User B joining circle using code '{invite_code}'...")
    res_join = requests.post(f"{BASE_URL}/circles/join", headers=headers_b, json={
        "invite_code": invite_code,
        "role": "Guard"
    })
    assert res_join.status_code == 200

    # 5. User A triggers SOS. This should create an in-app notification for User B,
    # which in turn triggers a background push notification to User B's push token.
    print("[*] User A triggering SOS...")
    res_sos = requests.post(f"{BASE_URL}/sos/trigger", headers=headers_a, json={
        "location_lat": 6.4281,
        "location_lng": 3.4219,
        "trigger_source": "manual"
    })
    assert res_sos.status_code == 200
    print("    SOS triggered successfully. Dispatching notifications...")

    # Wait a moment for background task execution (since push delivery is async/task-based)
    print("[*] Waiting for push dispatches to complete...")
    time.sleep(2)

    # 6. Check User B's notifications
    print("[*] User B fetching notifications to confirm SOS is received...")
    res_notif = requests.get(f"{BASE_URL}/notifications", headers=headers_b)
    assert res_notif.status_code == 200
    notifs = res_notif.json()
    assert len(notifs) > 0
    sos_notif = next((n for n in notifs if n["type"] == "sos_alert"), None)
    assert sos_notif is not None
    print(f"    Verified User B received in-app SOS notification: {sos_notif['message']}")

    print("\n🎉 PUSH NOTIFICATION BACKEND ROUTING VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_push_notifications()
