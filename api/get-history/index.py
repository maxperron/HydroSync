from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from urllib.parse import urlparse, parse_qs
from supabase import create_client, Client
from datetime import datetime, timezone

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
                start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                end_dt = datetime.strptime(end_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                
                # Timezone Offset (in hours, e.g., -5 for EST)
                # Client sends their offset from UTC.
                # If Client is EST (-5), they want 00:00 EST which is 05:00 UTC.
                # So we SUBTRACT the offset from the UTC base?
                # Target UTC = Local - Offset
                # 00:00 EST - (-5h) = 05:00 UTC. Correct.
                tz_offset = float(params.get('timezone_offset', [0])[0])
                offset_seconds = tz_offset * 3600
                
                # Start: 00:00:00 of start_date (Client Time) -> Adjusted to UTC
                ts_start = int((start_dt.timestamp() - offset_seconds) * 1000)
                
                # End: 23:59:59 of end_date (Client Time) -> Adjusted to UTC
                ts_end = int((end_dt.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp() - offset_seconds) * 1000)

            except ValueError:
                self.send_error_j(400, "Invalid date/offset format. Use YYYY-MM-DD and integer/float for offset")
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

            # Transform data to include local time string
            # This helps clients (like Home Assistant) see the 'correct' day immediately
            transformed_data = []
            for sip in sips_response.data:
                # sip['timestamp'] is in milliseconds UTC
                # We want to show the LOCAL time representing that sip
                ts_ms = sip.get('timestamp', 0)
                # Local TS = UTC + Offset
                # (We subtract offset in previous step to go Local -> UTC for filtering)
                # (Here we add offset to go UTC -> Local representation)
                # Wait, offset is e.g. -5.
                # UTC time 03:00. Local is 22:00.
                # 03:00 + (-5) = -02:00? No. 
                # UTC timestamp is an absolute point in time.
                # To get a datetime object representing local time:
                # dt_utc = datetime.fromtimestamp(ts_ms/1000, timezone.utc)
                # dt_local = dt_utc + timedelta(hours=tz_offset) -- effectively shifting the "clock face"
                
                # Simpler: Just construct string.
                # timestamp is epoch. 
                # To get local string: datetime.fromtimestamp(ts, tz=timezone(offset))
                
                try:
                    # Create a timezone-aware object for the user's specified offset
                    user_tz = timezone(timedelta(hours=tz_offset))
                    
                    local_dt = datetime.fromtimestamp(ts_ms / 1000, user_tz)
                    sip['local_date'] = local_dt.isoformat()
                    transformed_data.append(sip)
                except Exception:
                    transformed_data.append(sip)

            data = {
                "start_date": start_date_str,
                "end_date": end_date_str,
                "timezone_offset": tz_offset,
                "count": len(transformed_data),
                "data": transformed_data
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
