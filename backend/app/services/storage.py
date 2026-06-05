import os
import uuid
import boto3
from botocore.exceptions import NoCredentialsError

# --- Storage Configuration ---
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")  # e.g., for Cloudflare R2
S3_PUBLIC_URL_PREFIX = os.getenv("S3_PUBLIC_URL_PREFIX") # e.g. https://pub-xxx.r2.dev or custom domain

def upload_vehicle_photo(file_bytes: bytes, original_filename: str) -> str:
    """
    Upload a vehicle license plate photo.
    Falls back to local file storage if S3 credentials are not set up.
    Returns the public URL of the uploaded image.
    """
    # Generate unique filename to avoid naming collisions
    ext = os.path.splitext(original_filename)[1] or ".jpg"
    unique_filename = f"vehicle_{uuid.uuid4().hex}{ext}"

    # Check if we should use S3/R2
    use_s3 = all([S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY])

    if use_s3:
        try:
            print(f"[Storage Service] Uploading {unique_filename} to S3/R2 bucket: {S3_BUCKET_NAME}...")
            s3_client = boto3.client(
                "s3",
                aws_access_key_id=AWS_ACCESS_KEY_ID,
                aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                endpoint_url=S3_ENDPOINT_URL
            )
            
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=unique_filename,
                Body=file_bytes,
                ContentType="image/jpeg"
            )

            # Construct the public URL
            if S3_PUBLIC_URL_PREFIX:
                public_url = f"{S3_PUBLIC_URL_PREFIX.rstrip('/')}/{unique_filename}"
            elif S3_ENDPOINT_URL:
                # Custom endpoint url, construct bucket URL (strip bucket from endpoint if needed, or join)
                public_url = f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET_NAME}/{unique_filename}"
            else:
                public_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{unique_filename}"
                
            print(f"[Storage Service] Successfully uploaded to remote bucket. Public URL: {public_url}")
            return public_url

        except NoCredentialsError:
            print("[Storage Service Warning] Boto3 credentials missing or invalid. Falling back to local storage.")
        except Exception as e:
            print(f"[Storage Service Error] Failed to upload to S3/R2: {e}. Falling back to local storage.")

    # --- Local Filesystem Fallback ---
    # Create the static uploads directory if it does not exist
    static_dir = os.path.join(os.getcwd(), "static", "uploads")
    os.makedirs(static_dir, exist_ok=True)
    
    local_path = os.path.join(static_dir, unique_filename)
    print(f"[Storage Service Fallback] Saving file locally to: {local_path}...")
    
    with open(local_path, "wb") as f:
        f.write(file_bytes)
        
    # Return local development URL (will be served via FastAPI StaticFiles mount)
    host = os.getenv("API_HOST", "http://localhost:8000")
    local_url = f"{host.rstrip('/')}/static/uploads/{unique_filename}"
    print(f"[Storage Service Fallback] Local file saved. URL: {local_url}")
    return local_url
