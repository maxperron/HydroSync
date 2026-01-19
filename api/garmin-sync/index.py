from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import tempfile
from garminconnect import Garmin
from supabase import create_client, Client

# Configure Garmin Token storage to use /tmp (Vercel has write access to /tmp)
os.environ['GARMINTOKENS'] = tempfile.gettempdir()

# Security: Only allow sync for specific user if configured
ALLOWED_USER_ID = os.environ.get('ALLOWED_USER_ID')

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

            # SECURITY CHECK
            if ALLOWED_USER_ID and record.get('user_id') != ALLOWED_USER_ID:
                print(f"Security: Skipping sync for user {record.get('user_id')} (Not Allowed)", file=sys.stdout)
                self.send_success_j({'status': 'ignored', 'reason': 'user not allowed'})
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

            # Fetch Credentials from Database
            url = os.environ.get('SUPABASE_URL')
            key = os.environ.get('SUPABASE_SERVICE_KEY')
            if not url or not key:
                raise Exception("Missing Supabase Service Configuration")

            db_client: Client = create_client(url, key)
            
            user_id = record.get('user_id')
            if not user_id:
                raise Exception("Missing user_id in record")

            # Get credentials for this specific user
            creds_response = db_client.table('user_integrations').select('garmin_email, garmin_password').eq('user_id', user_id).execute()
            
            if not creds_response.data or len(creds_response.data) == 0:
                print(f"Info: No Garmin Integrations found for user {user_id}", file=sys.stdout)
                self.send_success_j({'status': 'ignored', 'reason': 'no garmin integration linked'})
                return

            email = creds_response.data[0]['garmin_email']
            password = creds_response.data[0]['garmin_password']
            
            if not email or not password:
                 print(f"Info: Incomplete credentials for user {user_id}", file=sys.stdout)
                 self.send_success_j({'status': 'ignored', 'reason': 'incomplete credentials'})
                 return

            print(f"Logging in to Garmin as {email}...", file=sys.stdout)
            
            # Garmin Login
            # Note: serverless cold start means we login often. 
            # ideally we'd store tokens in supabase secrets or DB, but that's complex for phase 2.
            # /tmp helps for warm starts.
            garmin = Garmin(email, password)
            
            try:
                # Try standard login (might try to load tokens and fail)
                garmin.login()
                print("Garmin Login Successful (Standard)", file=sys.stdout)
            except Exception as login_err:
                print(f"Warning: garmin.login() failed: {login_err}. Trying force login via garth...", file=sys.stdout)
                try:
                    # Fallback: Force garth login directly, bypassing token load attempt
                    # This requires accessing the internal garth client if exposed
                    if hasattr(garmin, 'garth'):
                         garmin.garth.login(email, password)
                         print("Garmin Login Successful (Garth Force)", file=sys.stdout)
                    else:
                        raise login_err
                except Exception as garth_err:
                    print(f"Error: Force login failed: {garth_err}", file=sys.stderr)
                    raise garth_err

            # Add Hydration
            # API: garmin.add_hydration(amount_in_ml) does not exist in the library.
            # We use the internal connectapi method to call the endpoint directly.
            # Endpoint: /usersummary-service/usersummary/hydration/log
            
            print(f"Adding hydration: {amount_to_sync}ml", file=sys.stdout)
            
            from datetime import datetime, timezone
            
            # Use current time or the sip timestamp
            if sip_timestamp:
                dt = datetime.fromtimestamp(sip_timestamp / 1000, tz=timezone.utc)
            else:
                dt = datetime.now(timezone.utc)
                
            calendar_date = dt.strftime("%Y-%m-%d")
            # timestampLocal is ISO format, usually without Z for some Garmin APIs, but we'll try standard ISO
            timestamp_local = dt.isoformat()

            hydration_payload = {
                "valueInML": amount_to_sync,
                "calendarDate": calendar_date,
                "timestampLocal": timestamp_local
            }
            
            print(f"Hydration Payload: {json.dumps(hydration_payload)}", file=sys.stdout)
            
            try:
                # Use garmin.connectapi() which handles auth headers and base URL
                # path should be relative to base URL (usually /usersummary-service/...)
                garmin.connectapi(
                    "/usersummary-service/usersummary/hydration/log",
                    method="PUT",
                    json=hydration_payload
                )
                print("Hydration Added Successfully via API", file=sys.stdout)
            except Exception as api_err:
                 print(f"API Error adding hydration: {api_err}", file=sys.stderr)
                 # Try POST just in case PUT is wrong (some docs say PUT, some POST)
                 print("Retrying with POST...", file=sys.stdout)
                 garmin.connectapi(
                    "/usersummary-service/usersummary/hydration/log",
                    method="POST",
                    json=hydration_payload
                )
                 print("Hydration Added Successfully via API (POST)", file=sys.stdout)
            
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
