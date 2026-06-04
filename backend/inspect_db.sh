#!/bin/bash
DB_PATH="coverme.db"
if [ ! -f "$DB_PATH" ]; then
    DB_PATH="backend/coverme.db"
fi

if [ ! -f "$DB_PATH" ]; then
    # Try parent directory lookup if they run from app folder
    DB_PATH="../coverme.db"
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Error: coverme.db not found! Please run from the project root or backend folder."
    exit 1
fi

echo "=============================================="
echo "         COVERME DATABASE INSPECTOR           "
echo "=============================================="
echo "Database location: $DB_PATH"
echo ""

echo "--- Tables & Record Counts ---"
echo "Users:"
sqlite3 "$DB_PATH" "SELECT count(*) FROM users;"
echo "Trusted Contacts:"
sqlite3 "$DB_PATH" "SELECT count(*) FROM trusted_contacts;"
echo "Journeys:"
sqlite3 "$DB_PATH" "SELECT count(*) FROM journeys;"
echo "SOS Alerts:"
sqlite3 "$DB_PATH" "SELECT count(*) FROM sos_alerts;"
echo "Emergency Command Lines:"
sqlite3 "$DB_PATH" "SELECT count(*) FROM emergency_command_lines;"
echo ""

echo "--- Quick SELECT Helpers (First 5 records) ---"
echo "👉 To view all users, run:"
echo "   sqlite3 $DB_PATH \"SELECT id, email, full_name, phone_number FROM users LIMIT 5;\""
echo ""
echo "👉 To view active journeys, run:"
echo "   sqlite3 $DB_PATH \"SELECT id, user_id, start_location, destination, is_active FROM journeys LIMIT 5;\""
echo ""
echo "👉 To view trusted contacts, run:"
echo "   sqlite3 $DB_PATH \"SELECT id, user_id, name, phone_number, relation FROM trusted_contacts LIMIT 5;\""
echo ""
echo "👉 To open the interactive SQL CLI, run:"
echo "   sqlite3 $DB_PATH"
echo "=============================================="
