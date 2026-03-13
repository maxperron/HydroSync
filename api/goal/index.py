from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from urllib.parse import urlparse, parse_qs
from supabase import create_client, Client

class handler(BaseHTTPRequestHandler):
    def get_supabase_client(self):
        url = os.environ.get('SUPABASE_URL')
        key = os.environ.get('SUPABASE_SERVICE_KEY')
        if not url or not key:
            print("Error: Missing Supabase Env Vars", file=sys.stderr)
            return None
        return create_client(url, key)

    def authenticate(self, supabase: Client):
        api_key = self.headers.get('x-api-key')
        if not api_key:
            self.send_error_j(401, "Missing x-api-key header")
            return None

        auth_response = supabase.table('user_integrations').select('user_id').eq('api_key', api_key).execute()
        
        if not auth_response.data or len(auth_response.data) == 0:
            self.send_error_j(401, "Invalid API Key")
            return None
        
        user_id = auth_response.data[0]['user_id']
        if not user_id:
             self.send_error_j(500, "User ID not found for key")
             return None
             
        return user_id

    def do_GET(self):
        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            
            date_str = params.get('date', [None])[0]
            
            if not date_str:
                self.send_error_j(400, "Missing date parameter (YYYY-MM-DD or 'default')")
                return

            supabase = self.get_supabase_client()
            if not supabase:
                self.send_error_j(500, "Server Configuration Error")
                return
                
            user_id = self.authenticate(supabase)
            if not user_id:
                return

            goal_response = supabase.table('daily_goals') \
                .select('*') \
                .eq('user_id', user_id) \
                .eq('date', date_str) \
                .execute()

            if goal_response.data and len(goal_response.data) > 0:
                self.send_success_j({
                    "date": date_str, 
                    "goal": goal_response.data[0]['goal']
                })
            else:
                self.send_success_j({
                    "date": date_str, 
                    "goal": None
                })

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            self.send_error_j(500, str(e))

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_j(400, "Missing request body")
                return
                
            post_data = self.rfile.read(content_length)
            body = json.loads(post_data.decode('utf-8'))
            
            date_str = body.get('date')
            goal_ml = body.get('goal')
            
            if not date_str:
                self.send_error_j(400, "Missing 'date' in JSON body")
                return
                
            if goal_ml is None or not isinstance(goal_ml, (int, float)):
                self.send_error_j(400, "Missing or invalid 'goal' in JSON body")
                return

            supabase = self.get_supabase_client()
            if not supabase:
                self.send_error_j(500, "Server Configuration Error")
                return
                
            user_id = self.authenticate(supabase)
            if not user_id:
                return

            # Upsert the daily goal
            resp = supabase.table('daily_goals').upsert({
                'user_id': user_id,
                'date': date_str,
                'goal': int(goal_ml)
            }, on_conflict='user_id,date').execute()

            self.send_success_j({
                "success": True, 
                "date": date_str, 
                "goal": goal_ml
            })

        except json.JSONDecodeError:
            self.send_error_j(400, "Invalid JSON body")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            self.send_error_j(500, str(e))

    def send_error_j(self, code, message):
        self.send_response(code)
        self.send_header('Content-type','application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

    def send_success_j(self, data):
        self.send_response(200)
        self.send_header('Content-type','application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'x-api-key, Content-Type')
        self.end_headers()
