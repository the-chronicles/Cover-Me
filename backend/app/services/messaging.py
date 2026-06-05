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

  async def send_whatsapp_template_via_meta(
      self, 
      recipient: str, 
      template_name: str, 
      parameters: List[Any],
      fallback_text: str = None
  ) -> Dict[str, Any]:
    clean_recipient = recipient.replace("+", "").strip()

    if self.meta_wa_token == "YOUR_META_WA_ACCESS_TOKEN" or not self.meta_wa_token:
      print(f"\n--- [META WHATSAPP TEMPLATE SIMULATION] ---")
      print(f"Recipient: {recipient}")
      print(f"Template: {template_name}")
      print(f"Parameters: {parameters}")
      print(f"Fallback Text: {fallback_text}")
      print(f"-------------------------------------------\n")
      return {"status": "simulated", "message": f"Meta credentials not configured. WhatsApp Template '{template_name}' simulated successfully."}

    # Ensure all parameters are stringified and non-None to avoid payload schema validation failures
    safe_parameters = [str(p) if p is not None else "" for p in parameters]

    url = f"https://graph.facebook.com/v18.0/{self.meta_wa_phone_id}/messages"
    headers = {
      "Authorization": f"Bearer {self.meta_wa_token}",
      "Content-Type": "application/json"
    }
    payload = {
      "messaging_product": "whatsapp",
      "to": clean_recipient,
      "type": "template",
      "template": {
        "name": template_name,
        "language": {
          "code": "en_US"
        },
        "components": [
          {
            "type": "body",
            "parameters": [
              {"type": "text", "text": p} for p in safe_parameters
            ]
          }
        ]
      }
    }

    try:
      async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=10.0)
        response_data = response.json()
        print(f"[Meta WhatsApp Response] Code {response.status_code}: {response_data}")
        
        if response.status_code != 200 or "error" in response_data:
            error_info = response_data.get("error", {})
            err_msg = error_info.get("message", "Unknown Meta API error")
            err_code = error_info.get("code")
            
            print(f"[Meta WhatsApp Warning] Template '{template_name}' failed to deliver: {err_msg} (Code: {err_code})")
            
            # Actionable diagnostics for Developer Sandbox and Business Accounts
            if err_code == 131030:
                print(f"[Meta WhatsApp Hint] ERROR 131030: The recipient number '{recipient}' is not verified in your Meta Developer Console. "
                      f"To fix this: Go to your App Dashboard -> WhatsApp -> API Setup, and add '{recipient}' as a verified test number. "
                      f"This limitation only applies to developer Sandbox numbers and will not apply once your account is live in production.")
            elif err_code in (131047, 470):
                print(f"[Meta WhatsApp Hint] ERROR {err_code}: Recipient is outside the 24-hour customer service window, "
                      f"AND the template '{template_name}' failed to deliver. Make sure the template '{template_name}' is "
                      f"active and approved under WhatsApp Manager in your Meta Business Suite, and that the parameter count matches.")
            elif err_code == 132001:
                print(f"[Meta WhatsApp Hint] ERROR 132001: Template '{template_name}' does not exist in en_US locale. "
                      f"You MUST create and register this template ('{template_name}') in your WhatsApp Manager dashboard before sending it.")

            # Fallback 1: Try sending the actual message as a free-text message (works if contact interacted in 24h)
            if fallback_text:
                print(f"[Meta WhatsApp] Template failed. Attempting fallback to free-text message...")
                payload_text = {
                  "messaging_product": "whatsapp",
                  "to": clean_recipient,
                  "type": "text",
                  "text": {
                    "body": fallback_text
                  }
                }
                resp_text = await client.post(url, json=payload_text, headers=headers, timeout=10.0)
                resp_text_data = resp_text.json()
                print(f"[Meta WhatsApp Text Fallback Response] Code {resp_text.status_code}: {resp_text_data}")
                
                if resp_text.status_code == 200 and "error" not in resp_text_data:
                    return {
                        "status": "success_via_text_fallback",
                        "message": f"Template '{template_name}' failed, but free-text fallback was successfully delivered (recipient has active 24h window).",
                        "data": resp_text_data
                    }
                else:
                    text_err_info = resp_text_data.get("error", {})
                    text_err_msg = text_err_info.get("message", "Unknown text fallback error")
                    text_err_code = text_err_info.get("code")
                    print(f"[Meta WhatsApp Warning] Free-text fallback failed: {text_err_msg} (Code: {text_err_code})")

            # Fallback 2: Try connectivity check via default 'hello_world' template
            print(f"[Meta WhatsApp] Attempting fallback to pre-approved 'hello_world' template to verify API connectivity...")
            payload_fallback = {
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
            resp_temp = await client.post(url, json=payload_fallback, headers=headers, timeout=10.0)
            resp_temp_data = resp_temp.json()
            print(f"[Meta WhatsApp Fallback Response] Code {resp_temp.status_code}: {resp_temp_data}")
            
            if resp_temp.status_code == 200 and "error" not in resp_temp_data:
                return {
                    "status": "success_via_template_fallback",
                    "message": f"Template '{template_name}' failed, but 'hello_world' test template was delivered.",
                    "data": resp_temp_data
                }
            
            temp_err_info = resp_temp_data.get("error", {})
            temp_err_code = temp_err_info.get("code")
            temp_err_msg = temp_err_info.get("message", "")
            if temp_err_code == 131058:
                print(f"[Meta WhatsApp Hint] ERROR 131058: 'hello_world' template cannot be sent from your registered number. "
                      f"Meta restricts 'hello_world' to Public Test Numbers. You must register your own templates for this number.")
            
            return {"status": "failed", "error": f"Template '{template_name}' failed: {err_msg}. Fallbacks failed."}
            
        return {"status": "success", "data": response_data}
    except Exception as e:
      print(f"[Meta WhatsApp Error] Failed to connect to Meta Cloud API: {e}")
      return {"status": "failed", "error": str(e)}

  async def broadcast_sos_alerts(
      self, 
      contacts: List[str], 
      message: str = "",
      user_name: str = None,
      location_link: str = None,
      timestamp: str = None
  ) -> List[Dict[str, Any]]:
    # Handle optional backward compatible parameters
    if not user_name:
      user_name = "CoverMe User"
    if not location_link:
      location_link = "Unknown Location"
    if not timestamp:
      import datetime
      timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    results = []
    # If explicit text message is not provided, compile from variables
    sms_text = message if message else f"EMERGENCY! {user_name} triggered SOS at location: {location_link}. Never walk alone."
    
    for contact in contacts:
      # Broadcast redundant messaging (SMS and WhatsApp) for maximum delivery assurance
      sms_res = await self.send_sms_via_termii(contact, sms_text)
      wa_res = await self.send_whatsapp_template_via_meta(
          recipient=contact,
          template_name="sos_alert",
          parameters=[user_name, location_link, timestamp],
          fallback_text=sms_text
      )
      results.append({
        "contact": contact,
        "sms_status": sms_res["status"],
        "whatsapp_status": wa_res["status"]
      })
    return results
