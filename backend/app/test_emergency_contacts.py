import time
import requests

BASE_URL = "http://localhost:8000"

def test_emergency_contacts_crud():
    print("🚀 Running emergency contacts CRUD & limit validation integration tests...")

    # 1. Register a test user
    email = f"test_contacts_{int(time.time())}@example.com"
    phone = f"+234803{str(int(time.time()))[-7:]}"
    print(f"[*] Registering user ({email})...")
    res_reg = requests.post(f"{BASE_URL}/register", json={
        "email": email,
        "password": "password123",
        "full_name": "Emergency Test User",
        "phone_number": phone
    })
    assert res_reg.status_code == 200, f"Registration failed: {res_reg.text}"

    # 2. Login
    print("[*] Logging in...")
    res_log = requests.post(f"{BASE_URL}/login", json={"email": email, "password": "password123"})
    assert res_log.status_code == 200
    token = res_log.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Add 3 contacts
    print("[*] Adding 3 emergency contacts...")
    contacts = [
        {"name": "Emergency Contact A", "phone_number": "+2348030000001", "relation": "Family"},
        {"name": "Emergency Contact B", "phone_number": "+2348030000002", "relation": "Friend"},
        {"name": "Emergency Contact C", "phone_number": "+2348030000003", "relation": "Work"}
    ]
    added_contacts = []
    for contact in contacts:
        res_add = requests.post(f"{BASE_URL}/contacts/add", headers=headers, json=contact)
        assert res_add.status_code == 200, f"Failed adding contact {contact['name']}: {res_add.text}"
        added_contacts.append(res_add.json())
        print(f"    Added: {contact['name']} ({contact['relation']})")

    # 4. Attempt to add a 4th contact (should fail)
    print("[*] Attempting to add 4th contact (expecting 400)...")
    res_add_4 = requests.post(f"{BASE_URL}/contacts/add", headers=headers, json={
        "name": "Emergency Contact D",
        "phone_number": "+2348030000004",
        "relation": "Other"
    })
    assert res_add_4.status_code == 400, f"Expected status 400, got {res_add_4.status_code}: {res_add_4.text}"
    assert "Maximum of 3 emergency contacts reached." in res_add_4.json()["detail"]
    print("    Verified limit of 3 emergency contacts is enforced.")

    # 5. List contacts
    print("[*] Listing contacts...")
    res_list = requests.get(f"{BASE_URL}/contacts/list", headers=headers)
    assert res_list.status_code == 200
    listed = res_list.json()
    assert len(listed) == 3, f"Expected 3 contacts, got {len(listed)}"
    print("    List verified successfully.")

    # 6. Update contact A
    contact_a_id = added_contacts[0]["id"]
    print(f"[*] Updating contact A (ID: {contact_a_id})...")
    updated_payload = {"name": "Emergency Contact A Updated", "phone_number": "+2348030000099", "relation": "Spouse"}
    res_update = requests.post(f"{BASE_URL}/contacts/{contact_a_id}/update", headers=headers, json=updated_payload)
    assert res_update.status_code == 200, f"Update failed: {res_update.text}"
    updated_data = res_update.json()
    assert updated_data["name"] == "Emergency Contact A Updated"
    assert updated_data["phone_number"] == "+2348030000099"
    assert updated_data["relation"] == "Spouse"
    print("    Update verified successfully.")

    # 7. Delete contact B
    contact_b_id = added_contacts[1]["id"]
    print(f"[*] Deleting contact B (ID: {contact_b_id})...")
    res_delete = requests.delete(f"{BASE_URL}/contacts/{contact_b_id}", headers=headers)
    assert res_delete.status_code == 200, f"Delete failed: {res_delete.text}"
    
    # List again to verify deletion
    res_list2 = requests.get(f"{BASE_URL}/contacts/list", headers=headers)
    assert len(res_list2.json()) == 2
    print("    Deletion verified successfully.")

    # 8. Add a new contact to replace B (should succeed since we have 2)
    print("[*] Adding a replacement contact...")
    replacement_payload = {"name": "Emergency Contact B Replacement", "phone_number": "+2348030000005", "relation": "Doctor"}
    res_add_repl = requests.post(f"{BASE_URL}/contacts/add", headers=headers, json=replacement_payload)
    assert res_add_repl.status_code == 200
    print("    Replacement added successfully.")

    # 9. Verify SOS triggers alerts only for the 3 active emergency contacts
    print("[*] Triggering SOS...")
    res_sos = requests.post(f"{BASE_URL}/sos/trigger", headers=headers, json={
        "location_lat": 6.4281,
        "location_lng": 3.4219,
        "trigger_source": "manual"
    })
    assert res_sos.status_code == 200
    sos_response = res_sos.json()
    assert sos_response["status"] == "triggered"
    assert sos_response["recipient_contacts_count"] == 3, f"Expected 3 recipient contacts, got {sos_response['recipient_contacts_count']}"
    print(f"    SOS trigger response verified: {sos_response}")

    print("\n🎉 ALL EMERGENCY CONTACT TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_emergency_contacts_crud()
