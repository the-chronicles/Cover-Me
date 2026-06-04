# CoverMe Safety Backend

FastAPI backend application powering the CoverMe safety platform, optimized for emergency routing and local location intelligence in Southwest Nigeria.

## Features
- **JWT Auth & User Security**: Safe accounts and password hashes.
- **Trusted Circle API**: Track trusted contacts to alert in case of safety issues.
- **Journey tracking (Follow Me)**: Setup trips, capture vehicle plate, and save locally.
- **Redundant SOS Alerts**: Calls SMS Gateways (Termii/Twilio) and WhatsApp Business API.
- **Local Command Lines**: Direct dial database for divisional police units and hospital wards.

## Quickstart

### Prerequisites
- Python 3.10+
- Virtual environment (`venv`)

### Installation & Run

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and active virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Run development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

The Swagger docs will be available at `http://localhost:8000/docs`.

### Docker
To run with docker:
```bash
docker build -t coverme-backend .
docker run -p 8000:8000 coverme-backend
```
