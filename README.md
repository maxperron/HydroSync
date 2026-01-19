# HydroSync - HidrateSpark PWA

A Progressive Web App (PWA) designed to connect to **HidrateSpark** smart water bottles via Bluetooth Web API. It tracks your daily water intake and synchronizes the data with **Garmin Connect**.

## ⚠️ Disclaimer
**This project is for my PERSONAL USE only.** 
I do not offer any support, maintenance, or guarantees for this application. Use it at your own risk.

## 🔗 Garmin Integration & Security Risk
This application syncs hydration data to Garmin Connect using the [garminconnect](https://github.com/cyberjunky/python-garminconnect) Python library by `cyberjunky`.

### 🚨 Security Warning
To function, this integration requires your **Garmin Connect email and password**. 
- These credentials are used to authenticate directly with Garmin's private API.
- This is **NOT** an official integration and does not use OAuth.
- **RISK**: Storing and using raw credentials poses a security risk. If the server is compromised, your Garmin account credentials could be exposed. 

## Features
- **Bluetooth Sync**: Connects directly to HidrateSpark bottles to read hydration data.
- **Offline Capable**: Queues sips locally and syncs when online.
- **Cross-Device Sync**: Syncs history and presets across devices using Supabase.
- **Garmin Sync**: Automatically pushes hydration data to Garmin Connect.

## Credits
- **Garmin Logic**: Powered by [cyberjunky/python-garminconnect](https://github.com/cyberjunky/python-garminconnect).
