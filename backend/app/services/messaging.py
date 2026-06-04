import os
import httpx
from typing import List, Dict, Any

class MessagingService:
  def __init__(self):
    self.termii_api_key = os.getenv("TERMII_API_KEY", "YOUR_TERMII_API_KEY")
    self.termii_sender_id = os.getenv("TERMII_SENDER_ID", "YOUR_REGISTERED_SENDER_ID")
    
    self.meta_wa_token = os.getenv("META_WA_ACCESS_TOKEN", "YOUR_META_WA_ACCESS_TOKEN")
    self.meta_wa_phone_id = os.getenv("META_WA_PHONE_NUMBER_ID", "YOUR_META_WA_PHONE_NUMBER_ID")

  async def send_sms_via_termii(self, recipient: str, message: str) -> Dict[str, Any]:
    # Clean phone formatting (remove + prefix for Termii, e.g. +234... to 234...)
    clean_recipient = recipient.replace("+", "").strip()
    
    # If credentials are not set up, run simulated output
    if self.termii_api_key == "YOUR_TERMII_API_KEY" or not self.termii_api_key:
      print(f"\n--- [TERMII SMS SIMULATION] ---")
      print(f"Recipient: {recipient}")
      print(f"Content: {message}")
      print(f"-------------------------------\n")
      return {"status": "simulated", "message": "Termii credentials not configured. SMS simulated successfully."}

    url = "https://api.ng.termii.com/api/sms/send"
    payload = {
      "to": clean_recipient,
      "from": self.termii_sender_id,
      "sms": message,
      "type": "plain",
      "channel": "dnd",  # Bypass DND lines in Nigeria
      "api_key": self.termii_api_key
    }

    try:
      async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=10.0)
        response_data = response.json()
        print(f"[Termii SMS Gateway Response] Code {response.status_code}: {response_data}")
        return {"status": "success", "data": response_data}
    except Exception as e:
      print(f"[Termii SMS Error] Failed to connect to Termii API: {e}")
      return {"status": "failed", "error": str(e)}

  async def send_whatsapp_via_meta(self, recipient: str, message: str) -> Dict[str, Any]:
    clean_recipient = recipient.replace("+", "").strip()

    if self.meta_wa_token == "YOUR_META_WA_ACCESS_TOKEN" or not self.meta_wa_token:
      print(f"\n--- [META WHATSAPP SIMULATION] ---")
      print(f"Recipient: {recipient}")
      print(f"Content: {message}")
      print(f"----------------------------------\n")
      return {"status": "simulated", "message": "Meta Cloud API credentials not configured. WhatsApp simulated successfully."}

    url = f"https://graph.facebook.com/v18.0/{self.meta_wa_phone_id}/messages"
    headers = {
      "Authorization": f"Bearer {self.meta_wa_token}",
      "Content-Type": "application/json"
    }
    payload = {
      "messaging_product": "whatsapp",
      "to": clean_recipient,
      "type": "text",
      "text": {
        "body": message
      }
    }

    try:
      async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=10.0)
        response_data = response.json()
        print(f"[Meta WhatsApp Response] Code {response.status_code}: {response_data}")
        
        # Fallback to standard 'hello_world' template if free-text is rejected (e.g. outside 24h customer window)
        if response.status_code != 200 or "error" in response_data:
            err_msg = response_data.get("error", {}).get("message", "Unknown Meta API error")
            print(f"[Meta WhatsApp Warning] Free-text message failed (likely outside 24h window): {err_msg}")
            print(f"[Meta WhatsApp] Attempting fallback to pre-approved 'hello_world' template to verify API connectivity...")
            
            payload_template = {
              "messaging_product": "whatsapp",
              "to": clean_recipient,
              "type": "template",
              "template": {
                "name": "hello_world",
                "language": {
                  "code": "en_US"
                }
              }
            }
            resp_temp = await client.post(url, json=payload_template, headers=headers, timeout=10.0)
            resp_temp_data = resp_temp.json()
            print(f"[Meta WhatsApp Fallback Response] Code {resp_temp.status_code}: {resp_temp_data}")
            
            if resp_temp.status_code == 200 and "error" not in resp_temp_data:
                return {
                    "status": "success_via_template_fallback",
                    "message": "Free-text failed (24h customer window), but 'hello_world' template delivered.",
                    "data": resp_temp_data
                }
            return {"status": "failed", "error": resp_temp_data.get("error", {}).get("message", err_msg)}
            
        return {"status": "success", "data": response_data}
    except Exception as e:
      print(f"[Meta WhatsApp Error] Failed to connect to Meta Cloud API: {e}")
      return {"status": "failed", "error": str(e)}

  async def broadcast_sos_alerts(self, contacts: List[str], message: str) -> List[Dict[str, Any]]:
    results = []
    for contact in contacts:
      # Broadcast redundant messaging (SMS and WhatsApp) for maximum delivery assurance
      sms_res = await self.send_sms_via_termii(contact, message)
      wa_res = await self.send_whatsapp_via_meta(contact, message)
      results.append({
        "contact": contact,
        "sms_status": sms_res["status"],
        "whatsapp_status": wa_res["status"]
      })
    return results
