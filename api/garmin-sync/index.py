from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import tempfile
from garminconnect import Garmin
from supabase import create_client, Client

# Configure Garmin Token storage to use /tmp (Vercel has write access to /tmp)
# The library checks GARMINTOKENS env var
os.environ['GARMINTOKENS'] = tempfile.gettempdir()
# Alternatively, we can just login every time if we don't care about rate limits for now,
# but using /tmp helps if the container is warm.

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Parse Content-Length with fallback/error handling
            content_length_header = self.headers.get('Content-Length')
            if not content_length_header:
                print("Error: Missing Content-Length header", file=sys.stderr)
                self.send_error_j(400, "Missing Content-Length header")
                return
            
            content_length = int(content_length_header)
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data)
            except json.JSONDecodeError as e:
                print(f"Error: Invalid JSON: {e}", file=sys.stderr)
                self.send_error_j(400, "Invalid JSON payload")
                return

            print(f"Received Payload: {json.dumps(payload)}", file=sys.stdout) # Verbose log

            # Supabase Webhook Payload Structure:
            # { "type": "INSERT", "table": "sips", "record": { ... }, "schema": "public", "old_record": null }
            
            record = payload.get('record')
            if not record:
                # Could be a ping or different event
                print("Warning: No 'record' found in payload", file=sys.stdout)
                self.send_success_j({'status': 'ignored', 'reason': 'no record'})
                return

            sip_timestamp = record.get('timestamp')
            volume_ml = record.get('volume_ml')
            # Check if it was already synced (loop prevention, though unlikely with INSERT trigger)
            if record.get('is_synced_garmin'):
                print("Info: Already synced", file=sys.stdout)
                self.send_success_j({'status': 'ignored', 'reason': 'already synced'})
                return

            # amount_to_sync is volume_ml. 
            # Note: We assume volume_ml is positive.
            amount_to_sync = volume_ml 
            
            if not amount_to_sync or amount_to_sync <= 0:
                 print(f"Info: Invalid amount {amount_to_sync}", file=sys.stdout)
                 self.send_success_j({'status': 'ignored', 'reason': 'zero or negative volume'})
                 return

            # Connect to Garmin
            email = os.environ.get('GARMIN_EMAIL')
            password = os.environ.get('GARMIN_PASSWORD')
            
            if not email or not password:
                raise Exception("Missing Garmin Credentials (GARMIN_EMAIL or GARMIN_PASSWORD)")

            print(f"Logging in to Garmin as {email}...", file=sys.stdout)
            
            # Garmin Login
            # Note: serverless cold start means we login often. 
            # ideally we'd store tokens in supabase secrets or DB, but that's complex for phase 2.
            # /tmp helps for warm starts.
            garmin = Garmin(email, password)
            garmin.login()
            
            print("Garmin Login Successful", file=sys.stdout)

            # Add Hydration
            print(f"Adding hydration: {amount_to_sync}ml", file=sys.stdout)
            garmin.add_hydration(amount_to_sync)
            
            # Success! Now update Supabase
            url = os.environ.get('SUPABASE_URL')
            key = os.environ.get('SUPABASE_SERVICE_KEY')
            if url and key:
                print("Updating Supabase record...", file=sys.stdout)
                try:
                    supabase: Client = create_client(url, key)
                    supabase.table('sips').update({'is_synced_garmin': True}).eq('id', record['id']).execute()
                    print("Supabase update successful", file=sys.stdout)
                except Exception as db_err:
                    print(f"Error updating Supabase: {db_err}", file=sys.stderr)
                    # Don't fail the request if just the status update failed, but good to know.
            
            self.send_success_j({'status': 'success', 'synced': amount_to_sync})
            
        except Exception as e:
            print(f"CRITICAL ERROR: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr) # Print full stack trace to logs
            self.send_error_j(500, str(e))

    def send_error_j(self, code, message):
        self.send_response(code)
        self.send_header('Content-type','application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

    def send_success_j(self, data):
        self.send_response(200)
        self.send_header('Content-type','application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
