from http.server import BaseHTTPRequestHandler
import json
import os
from garminconnect import Garmin
from supabase import create_client, Client

# Environment Variables (Vercel)
# SUPABASE_URL
# SUPABASE_SERVICE_KEY (Need Service Key to write back 'is_synced_garmin' bypassing RLS if needed, or Anon Key if RLS allows update by user? 
# Webhook won't have user session. So we need Service Role Key to update the row as system.)
# GARMIN_EMAIL
# GARMIN_PASSWORD

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data)

            # Supabase Webhook Payload Structure:
            # { "type": "INSERT", "table": "sips", "record": { ... }, "schema": "public", "old_record": null }
            
            record = payload.get('record')
            if not record:
                self.send_response(400)
                self.end_headers()
                return

            sip_timestamp = record.get('timestamp')
            volume_ml = record.get('volume_ml')
            hydration_factor = record.get('hydration_factor', 100)
            
            # Calculate actual hydration
            # If factor is 90%, actual water is 90%? Or does Garmin want raw water? 
            # Mission Statement: "Logic: Garmin only receives the raw ml value. The 'Hydration Factor' logic must be processed before syncing to Garmin."
            # Wait, "must be processed BEFORE syncing".
            # So if I drank 500ml of Coffee (Hydration Factor 90%), do I send 500ml or 450ml?
            # User said "Logic: Garmin only receives the raw ml value. The 'Hydration Factor' logic must be processed before syncing to Garmin."
            # This likely means we send the CALCULATED value. 
            # If volume_ml in DB is already calculated?
            # In store: `calculatedVolumeMl` is stored in manual entries. 
            # In SQL Schema: `volume_ml` column. 
            # In `SyncService.ts`: 
            #   bottle: volume_ml = s.volumeMl (factor 100 usually)
            #   manual: volume_ml = e.calculatedVolumeMl (So it IS ALREADY PROCESSED).
            
            amount_to_sync = volume_ml 
            
            if amount_to_sync <= 0:
                 self.send_response(200)
                 self.end_headers()
                 return

            # Connect to Garmin
            email = os.environ.get('GARMIN_EMAIL')
            password = os.environ.get('GARMIN_PASSWORD')
            
            if not email or not password:
                raise Exception("Missing Garmin Credentials")

            garmin = Garmin(email, password)
            garmin.login()
            
            # Add Hydration
            # API: garmin.add_hydration(amount_in_ml) -> check unit if necessary, usually it takes ml or undefined unit
            # Based on library docs, `add_hydration(value)`
            garmin.add_hydration(amount_to_sync)
            
            # Success! Now update Supabase
            url = os.environ.get('SUPABASE_URL')
            key = os.environ.get('SUPABASE_SERVICE_KEY')
            if url and key:
                supabase: Client = create_client(url, key)
                supabase.table('sips').update({'is_synced_garmin': True}).eq('id', record['id']).execute()
            
            self.send_response(200)
            self.send_header('Content-type','application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success', 'synced': amount_to_sync}).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type','application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
