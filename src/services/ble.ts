import { useHydrationStore } from '../store/hydrationStore';

// UUIDs from User Request (Hardware Identity)
const TARGET_DEVICE_NAME = 'h2oDB618BB';
const SERVICE_UUID_USER = 'bf2d1ba0-c473-49f2-9571-0ce69036c642';
const CHAR_UUID_USER_DATA = 'bf2d1ba1-c473-49f2-9571-0ce69036c642';

// Reference UUIDs from Python script (for Handshake/Fallback)
const SERVICE_UUID_REF = '45855422-6565-4cd7-a2a9-fe8af41b85e8';

const UUIDS = {
    // User specific
    CHAR_USER_DATA: CHAR_UUID_USER_DATA,

    // Reference (Handshake)
    CHAR_DATA_POINT: '016e11b1-6c8a-4074-9e5a-076053f93784', // Old data point
    CHAR_SET_POINT: 'b44b03f0-b850-4090-86eb-72863fb3618d',
    CHAR_DEBUG: 'e3578b0d-caa7-46d6-b7c2-7331c08de044',
    CHAR_LED_CONTROL: 'a1d9a5bf-f5d8-49f3-a440-e6bf27440cb0',
    // Standard Battery Service
    CHAR_BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
};

// Handshake sequences from Python script
const HANDSHAKE_COMMANDS = [
    { char: 'DEBUG', val: '2100d1' },
    { char: 'SET_POINT', val: '92' },
    { char: 'DEBUG', val: '2200f7' },
    { char: 'SET_POINT', val: '7700000032d70000' },
    { char: 'SET_POINT', val: '00341b00e0790000' },
    { char: 'SET_POINT', val: '02345200c0a80000' },
    { char: 'SET_POINT', val: '03346e0030c00000' },
    { char: 'SET_POINT', val: '04348900a0d70000' },
    { char: 'SET_POINT', val: '0534a50010ef0000' },
    { char: 'SET_POINT', val: '0634c00080060100' },
    { char: 'SET_POINT', val: '0734dc00f01d0100' },
    { char: 'SET_POINT', val: '0834000000000000' },
    { char: 'SET_POINT', val: '0934000000000000' },
];

const BOTTLE_SIZE_DEFAULT = 591; // 20oz? Adjusted if needed.

export class HidrateSparkBLE {
    private device: BluetoothDevice | null = null;
    private chars: Record<string, BluetoothRemoteGATTCharacteristic> = {};

    async connect() {
        const { setDeviceStatus, setDeviceName } = useHydrationStore.getState();

        try {
            setDeviceStatus('connecting');

            // Filter by name prefix 'h2o'
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'h2o' }],
                optionalServices: [
                    SERVICE_UUID_USER,
                    SERVICE_UUID_REF,
                    'battery_service'
                ]
            });

            this.device = device;
            setDeviceName(device.name || TARGET_DEVICE_NAME);

            this.device.addEventListener('gattserverdisconnected', this.onDisconnected);

            const server = await device.gatt?.connect();
            if (!server) throw new Error("GATT Server not found");

            console.log('Connected to GATT Server');

            // 1. Try to get the User Service first
            let userService: BluetoothRemoteGATTService | undefined;
            try {
                userService = await server.getPrimaryService(SERVICE_UUID_USER);
            } catch (e) {
                console.warn("User service not found:", e);
            }

            // 2. Try to get the Reference Service (for handshake chars)
            let refService: BluetoothRemoteGATTService | undefined;
            try {
                refService = await server.getPrimaryService(SERVICE_UUID_REF);
            } catch (e) {
                console.warn("Reference service not found:", e);
            }

            // We need at least one service
            if (!userService && !refService) throw new Error("No compatible services found");

            // 3. Resolve Characteristics
            // Try to find the user data char in user service
            if (userService) {
                try {
                    this.chars.DATA_POINT = await userService.getCharacteristic(UUIDS.CHAR_USER_DATA);
                    console.log("Found User Data Characteristic");
                } catch (e) { console.warn("User Data Char not found in User Service", e); }
            }

            // If not found, fallback to ref service data point
            if (!this.chars.DATA_POINT && refService) {
                try {
                    this.chars.DATA_POINT = await refService.getCharacteristic(UUIDS.CHAR_DATA_POINT);
                    console.log("Found Reference Data Characteristic");
                } catch (e) { console.warn("Ref Data Char not found", e); }
            }

            if (!this.chars.DATA_POINT) throw new Error("Could not find any Data Characteristic");

            // Battery Service (Standard)
            try {
                const battService = await server.getPrimaryService('battery_service');
                this.chars.BATTERY_LEVEL = await battService.getCharacteristic(UUIDS.CHAR_BATTERY_LEVEL);

                // Read initial
                const battVal = await this.chars.BATTERY_LEVEL.readValue();
                const level = battVal.getUint8(0);
                useHydrationStore.setState({ batteryLevel: level });
                console.log(`Battery Level: ${level}%`);

                // Create handler
                const handleBattery = (event: Event) => {
                    const val = (event.target as BluetoothRemoteGATTCharacteristic).value;
                    if (val) {
                        const lvl = val.getUint8(0);
                        useHydrationStore.setState({ batteryLevel: lvl });
                        console.log(`Battery update: ${lvl}%`);
                    }
                };

                // Store handler reference if needed for cleanup, for now just addListener
                this.chars.BATTERY_LEVEL.addEventListener('characteristicvaluechanged', handleBattery);
                await this.chars.BATTERY_LEVEL.startNotifications();

            } catch (e) {
                console.warn("Battery Service not accessible", e);
            }

            // Find Handshake Chars (SetPoint/Debug) - usually in Ref service, but check User service too
            const findChar = async (uuid: string) => {
                if (refService) {
                    try { return await refService.getCharacteristic(uuid); } catch { }
                }
                if (userService) {
                    try { return await userService.getCharacteristic(uuid); } catch { }
                }
                return undefined;
            };

            this.chars.DEBUG = (await findChar(UUIDS.CHAR_DEBUG))!;
            this.chars.SET_POINT = (await findChar(UUIDS.CHAR_SET_POINT))!;
            this.chars.LED_CONTROL = (await findChar(UUIDS.CHAR_LED_CONTROL))!;

            if (!this.chars.DEBUG || !this.chars.SET_POINT) {
                console.warn("Handshake characteristics missing! Connection might drop.");
            }

            console.log('Characteristics resolved, starting handshake...');

            // Perform Handshake
            await this.performHandshake();

            // Subscribe to Data
            await this.chars.DATA_POINT.startNotifications();
            this.chars.DATA_POINT.addEventListener('characteristicvaluechanged', (event: Event) => {
                const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
                if (value) this.handleDataPoint(value);
            });

            // Signal ready for reading sips (from python: send 0x57 to DATA_POINT)
            // `self.queue_write_transaction(self.DATA_ch.getHandle(), bytes.fromhex('57'))`
            await this.chars.DATA_POINT.writeValue(new Uint8Array([0x57]));

            setDeviceStatus('connected');
            console.log('HidrateSpark Connected & Listening');

        } catch (error) {
            console.error("Connection failed", error);
            setDeviceStatus('disconnected');
        }
    }

    private async performHandshake() {
        for (const cmd of HANDSHAKE_COMMANDS) {
            const char = this.chars[cmd.char];
            if (char) {
                // Convert hex string to Uint8Array
                const bytes = new Uint8Array(cmd.val.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
                await char.writeValue(bytes);
                // Small delay might be safer
                await new Promise(r => setTimeout(r, 50));
            }
        }
    }

    private handleDataPoint(data: DataView) {
        // Python Parsing Logic:
        // no_sips_left_on_device = data[0]
        // b2 = data[1] & 255
        // SipSize = (BOTTLE_SIZE * b2) / 100
        // total = data[3]...data[2] (little endian)
        // secondsAgo = data[8]...data[4] (little endian)

        // DataView is easier for numbers
        const buffer = new Uint8Array(data.buffer);
        const no_sips_left_on_device = buffer[0];

        if (no_sips_left_on_device > 0) {
            // Check valid data
            // Python: if int.from_bytes(data[1:], "big") > 0:

            const b2 = buffer[1]; // Percentage?
            const sipSize = Math.round((BOTTLE_SIZE_DEFAULT * b2) / 100);

            // Python: total = int.from_bytes(data[3:1:-1], "little") & 65535  -> data[3], data[2]
            // This implies data[2] is MSB, data[3] is LSB (Big Endian sequence in memory) -> 0x0102 read as 0x01 as MSB.
            // DataView defaults to Big Endian, so getUint16(2) is Big Endian.
            const total = data.getUint16(2, false);

            // Python: secondsAgo = int.from_bytes(data[8:4:-1], "little") -> bytes 5,6,7,8 -> data[5] is MSB.
            const secondsAgo = data.getUint32(5, false);

            console.log(`Sip detected: ${sipSize}ml, Total: ${total}, SecondsAgo: ${secondsAgo}, Left: ${no_sips_left_on_device}`);

            if (sipSize > 0) {
                useHydrationStore.getState().addBottleSip({
                    timestamp: Date.now() - (secondsAgo * 1000), // Adjust timestamp based on bottle
                    volumeMl: sipSize,
                    source: 'bottle'
                });
            }

            // Acknowledge by pulsing light? Python does `lightUpBottle_OneShortPulseWhite()`
            this.pulseWhite();
        } else {
            // Python: if empty, issue ready for reading sips again
            this.chars.DATA_POINT.writeValue(new Uint8Array([0x57]));
        }
    }

    async pulseWhite() {
        if (this.chars.LED_CONTROL) {
            await this.chars.LED_CONTROL.writeValue(new Uint8Array([0x02]));
        }
    }

    onDisconnected = () => {
        useHydrationStore.getState().setDeviceStatus('disconnected');
        console.log('Device Disconnected');
    }
}

export const bleService = new HidrateSparkBLE();
