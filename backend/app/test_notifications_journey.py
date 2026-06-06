import time
import requests

BASE_URL = "http://localhost:8000"

def test_integration():
    print("🚀 Running notifications and journey watchers integration tests...")

    # 1. Register User A and User B
    email_a = f"usera_{int(time.time())}@example.com"
    email_b = f"userb_{int(time.time())}@example.com"
    phone_a = f"+234803{str(int(time.time()))[-7:]}"
    phone_b = f"+234803{str(int(time.time()) + 1)[-7:]}"

    print(f"[*] Registering User A ({email_a})...")
    res_reg_a = requests.post(f"{BASE_URL}/register", json={
        "email": email_a,
        "password": "password123",
        "full_name": "User Alpha",
        "phone_number": phone_a
    })
    assert res_reg_a.status_code == 200, f"Failed User A reg: {res_reg_a.text}"

    print(f"[*] Registering User B ({email_b})...")
    res_reg_b = requests.post(f"{BASE_URL}/register", json={
        "email": email_b,
        "password": "password123",
        "full_name": "User Beta",
        "phone_number": phone_b
    })
    assert res_reg_b.status_code == 200, f"Failed User B reg: {res_reg_b.text}"

    # 2. Login User A and User B
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

    # 3. User A creates a Circle
    print("[*] User A creating circle...")
    res_circle = requests.post(f"{BASE_URL}/circles/create", headers=headers_a, json={
        "name": "Alpha Safety Squad",
        "category": "Friends",
        "role": "Leader"
    })
    assert res_circle.status_code == 200
    circle = res_circle.json()
    circle_id = circle["id"]
    invite_code = circle["invite_code"]
    print(f"    Circle created: {circle['name']} (ID: {circle_id}, Code: {invite_code})")

    # 4. User A invites User B directly by email
    print(f"[*] User A sending direct invite to User B ({email_b})...")
    res_invite = requests.post(f"{BASE_URL}/circles/{circle_id}/invite", headers=headers_a, json={
        "recipient_email_or_phone": email_b,
        "role": "Guard"
    })
    assert res_invite.status_code == 200, f"Invite failed: {res_invite.text}"

    # 5. User B fetches notifications and joins using code
    print("[*] User B checking notification inbox...")
    res_notif_b = requests.get(f"{BASE_URL}/notifications", headers=headers_b)
    assert res_notif_b.status_code == 200
    notifs = res_notif_b.json()
    assert len(notifs) > 0, "User B should have received direct invite notification"
    invite_notif = notifs[0]
    assert invite_notif["type"] == "circle_invite"
    assert invite_code in invite_notif["message"]
    print("    Verified User B received Circle Invitation in inbox.")

    print(f"[*] User B joining circle using code '{invite_code}'...")
    res_join = requests.post(f"{BASE_URL}/circles/join", headers=headers_b, json={
        "invite_code": invite_code,
        "role": "Guard"
    })
    assert res_join.status_code == 200, f"Join failed: {res_join.text}"

    # 6. User A receives notification that User B joined
    print("[*] User A checking notification inbox...")
    res_notif_a = requests.get(f"{BASE_URL}/notifications", headers=headers_a)
    assert res_notif_a.status_code == 200
    notifs_a = res_notif_a.json()
    assert len(notifs_a) > 0, "User A should have received a notification"
    join_notif = notifs_a[0]
    assert join_notif["type"] == "circle_join"
    assert "User Beta" in join_notif["message"]
    print("    Verified User A received 'Circle Member Joined' notification.")

    # 7. User A starts a journey designating User B's circle as watchers
    print("[*] User A initiating Follow Me Session...")
    res_journey = requests.post(f"{BASE_URL}/journey/start", headers=headers_a, json={
        "start_location": "Ikeja Shoprite",
        "destination": "Lagos Marina",
        "duration_minutes": 45,
        "license_plate": "IKJ-999AA",
        "watcher_type": "circle",
        "watcher_id": circle_id
    })
    assert res_journey.status_code == 200
    journey = res_journey.json()
    assert journey["is_active"] is True
    print(f"    Journey started (ID: {journey['id']}) from {journey['start_location']} to {journey['destination']}")

    # 8. User B receives journey start notification
    print("[*] User B checking notification inbox...")
    res_notif_b = requests.get(f"{BASE_URL}/notifications", headers=headers_b)
    notifs_b = res_notif_b.json()
    journey_notif = next((n for n in notifs_b if n["type"] == "journey_start"), None)
    assert journey_notif is not None, "User B should have received journey start notification"
    assert "User Alpha" in journey_notif["message"]
    print("    Verified User B received 'Journey Started' notification.")

    # 9. User B fetches active watched journeys list
    print("[*] User B fetching active watched journeys...")
    res_watched = requests.get(f"{BASE_URL}/journey/active-watched", headers=headers_b)
    assert res_watched.status_code == 200
    watched_list = res_watched.json()
    assert len(watched_list) > 0, "User B should see User A's active journey"
    watched_j = watched_list[0]
    assert watched_j["journey_id"] == journey["id"]
    assert watched_j["traveler_name"] == "User Alpha"
    print("    Verified User B is successfully watching User A's journey.")

    # 10. User A syncs live location coordinate updates
    print("[*] User A updating live GPS coordinates...")
    res_loc = requests.post(f"{BASE_URL}/location/update", headers=headers_a, json={
        "lat": 6.5966,
        "lng": 3.3362
    })
    assert res_loc.status_code == 200
    
    # 11. User B queries active watched journeys again to check coordinates stream
    print("[*] User B checking traveler coordinate stream...")
    res_watched2 = requests.get(f"{BASE_URL}/journey/active-watched", headers=headers_b)
    assert res_watched2.status_code == 200
    watched_j2 = res_watched2.json()[0]
    assert watched_j2["last_lat"] == 6.5966
    assert watched_j2["last_lng"] == 3.3362
    print("    SUCCESS: Watcher successfully tracked traveler coordinates live!")

    # 12. User B marks all notifications as read
    print("[*] User B marking all notifications read...")
    res_read_all = requests.post(f"{BASE_URL}/notifications/read-all", headers=headers_b)
    assert res_read_all.status_code == 200
    res_notif_b2 = requests.get(f"{BASE_URL}/notifications", headers=headers_b)
    assert all(n["read"] is True for n in res_notif_b2.json())
    print("    Verified User B successfully marked all notifications read.")

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY! Integration works beautifully.")

if __name__ == "__main__":
    test_integration()
