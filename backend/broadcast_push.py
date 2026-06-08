import os
import asyncio
import sys
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.database import models
from app.services.messaging import MessagingService

async def main():
    # Default message template
    title = "CoverMe Alert"
    message_template = "Hey {name}, remember to always stay safe."
    
    # If CLI arguments are provided:
    # Example: python broadcast_push.py "Alert" "Hey {name}, remember to always stay safe"
    if len(sys.argv) > 1:
        if len(sys.argv) >= 2:
            title = sys.argv[1]
        if len(sys.argv) >= 3:
            message_template = sys.argv[2]
        print(f"[*] Broadcasting notification:")
        print(f"    Title: {title}")
        print(f"    Message: {message_template}")
    else:
        # Interactive CLI mode
        print("=========================================")
        print("📣  CoverMe Broadcast Push Notification Tool")
        print("=========================================")
        input_title = input(f"Enter Notification Title [default: '{title}']: ").strip()
        if input_title:
            title = input_title
            
        print("\nEnter message body. You can use '{name}' to personalize the message.")
        input_msg = input(f"Message [default: '{message_template}']: ").strip()
        if input_msg:
            message_template = input_msg

    db: Session = SessionLocal()
    try:
        # Fetch users with active push tokens
        users = db.query(models.User).filter(
            models.User.push_token.isnot(None),
            models.User.push_token != ""
        ).all()
        
        if not users:
            print("\n❌ No users found with registered push tokens in the database.")
            return

        print(f"\n[*] Found {len(users)} user(s) with active push tokens:")
        for idx, u in enumerate(users, start=1):
            print(f"  {idx}. {u.full_name} ({u.email}) -> Token: {u.push_token[:35]}...")

        # Ask for confirmation in interactive mode, auto-confirm if run with args
        if len(sys.argv) == 1:
            confirm = input("\nDo you want to send this broadcast to all these users? (y/n): ").strip().lower()
            if confirm != 'y':
                print("Aborted.")
                return
        
        print("\n🚀 Sending notifications...")
        messaging = MessagingService()
        success_count = 0
        failure_count = 0

        for u in users:
            # Personalize message if {name} placeholder is present
            personalized_msg = message_template.replace("{name}", u.full_name)
            print(f"[*] Sending to {u.full_name}...")
            
            res = await messaging.send_push_via_expo(
                push_token=u.push_token,
                title=title,
                body=personalized_msg
            )
            
            if res.get("status") == "success":
                print(f"    ✅ Sent successfully!")
                success_count += 1
            else:
                print(f"    ❌ Failed: {res.get('error')}")
                failure_count += 1

        print(f"\n🎉 Broadcast completed! Success: {success_count}, Failed: {failure_count}")

    finally:
        db.close()

if __name__ == "__main__":
    # Set the package context so imports work correctly when run from the root backend dir
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    asyncio.run(main())
