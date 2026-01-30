from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from urllib.parse import urlparse, parse_qs
from supabase import create_client, Client
from datetime import datetime

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # 1. Parse Query Parameters
            query = urlparse(self.path).query
            params = parse_qs(query)
            
            start_date_str = params.get('start_date', [None])[0]
            end_date_str = params.get('end_date', [None])[0]
            
            if not start_date_str:
                self.send_error_j(400, "Missing start_date parameter (YYYY-MM-DD)")
                return

            if not end_date_str:
                end_date_str = start_date_str

            # Validate Date Format
            try:
                start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
                # Create timestamps for filtering (start of start_date to end of end_date)
                # Note: 'timestamp' in Supabase is likely epoch ms or big int. 
                # Let's check schema assumption. Store saves Date.now() which is ms.
                # So we need ms timestamps.
                
                # Start: 00:00:00 of start_date
                ts_start = int(start_dt.timestamp() * 1000) 
                
                # End: 23:59:59 of end_date (add 1 day, sub 1 ms)
                ts_end = int(end_dt.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp() * 1000)

            except ValueError:
                self.send_error_j(400, "Invalid date format. Use YYYY-MM-DD")
                return

            # 2. Authentication (API Key)
            api_key = self.headers.get('x-api-key')
            if not api_key:
                self.send_error_j(401, "Missing x-api-key header")
                return

            # Initialize Supabase
            url = os.environ.get('SUPABASE_URL')
            key = os.environ.get('SUPABASE_SERVICE_KEY')
            if not url or not key:
                print("Error: Missing Supabase Env Vars", file=sys.stderr)
                self.send_error_j(500, "Server Configuration Error")
                return

            supabase: Client = create_client(url, key)

            # Validate API Key
            # Query user_integrations to find user_id associated with this key
            auth_response = supabase.table('user_integrations').select('user_id').eq('api_key', api_key).execute()
            
            if not auth_response.data or len(auth_response.data) == 0:
                self.send_error_j(401, "Invalid API Key")
                return
            
            user_id = auth_response.data[0]['user_id']
            if not user_id:
                 self.send_error_j(500, "User ID not found for key")
                 return

            # 3. Fetch Data
            # Fetch Sips
            sips_response = supabase.table('sips') \
                .select('*') \
                .eq('user_id', user_id) \
                .gte('timestamp', ts_start) \
                .lte('timestamp', ts_end) \
                .execute()

            # Optional: Transform data if needed, or just return raw
            # For simplicity and flexibility, raw is usually best for integrations.
            
            data = {
                "start_date": start_date_str,
                "end_date": end_date_str,
                "count": len(sips_response.data),
                "data": sips_response.data
            }

            self.send_success_j(data)

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
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
