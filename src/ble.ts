// noinspection JSUnusedGlobalSymbols
import noble from "@abandonware/noble";
import { log } from "./log.js";

export const DEVICE_NAME = "Claude Controller";
export const SERVICE_UUID = "4c41555a44657669636500000000000001".replace(/-/g, "");
// noble uses lowercase, no-dash form for service/char UUIDs.
export const SERVICE_UUID_NOBLE = "4c41555a446576696365000000000001";
export const RX_CHAR_UUID_NOBLE = "4c41555a446576696365000000000002";
export const REQ_CHAR_UUID_NOBLE = "4c41555a446576696365000000000004";

export const SCAN_TIMEOUT_MS = 8_000;

type Peripheral = any;
type Characteristic = any;

async function waitForPoweredOn(): Promise<void> {
  if ((noble as any).state === "poweredOn") return;
  await new Promise<void>((resolve, reject) => {
    const onState = (state: string) => {
      if (state === "poweredOn") {
        (noble as any).removeListener("stateChange", onState);
        resolve();
      } else if (state === "unsupported" || state === "unauthorized") {
        (noble as any).removeListener("stateChange", onState);
        reject(new Error(`Bluetooth state: ${state}`));
      }
    };
    (noble as any).on("stateChange", onState);
  });
}

export async function scanForDevice(): Promise<string | null> {
  await waitForPoweredOn();
  log(`Scanning for '${DEVICE_NAME}' (${SCAN_TIMEOUT_MS / 1000}s)...`);
  let found: string | null = null;

  return new Promise<string | null>((resolve) => {
    const onDiscover = (peripheral: Peripheral) => {
      const name = peripheral.advertisement?.localName;
      if (name === DEVICE_NAME) {
        found = peripheral.id ?? peripheral.uuid ?? peripheral.address;
        log(`Found: ${found}`);
        cleanup();
        resolve(found);
      }
    };
    const cleanup = () => {
      (noble as any).removeListener("discover", onDiscover);
      (noble as any).stopScanning(() => {});
    };
    (noble as any).on("discover", onDiscover);
    (noble as any).startScanning([SERVICE_UUID_NOBLE], false, (err: Error | null) => {
      if (err) {
        log(`Scan start error: ${err.message}`);
        cleanup();
        resolve(null);
      }
    });
    setTimeout(() => {
      if (!found) {
        cleanup();
        resolve(null);
      }
    }, SCAN_TIMEOUT_MS);
  });
}

async function findPeripheral(addressOrId: string): Promise<Peripheral | null> {
  await waitForPoweredOn();
  // On macOS noble uses UUIDs as ids; on Linux it uses MAC (lowercased, no colons) for id and address for MAC form.
  const target = addressOrId.toLowerCase();
  return new Promise<Peripheral | null>((resolve) => {
    let done = false;
    const onDiscover = (peripheral: Peripheral) => {
      const id = String(peripheral.id ?? "").toLowerCase();
      const addr = String(peripheral.address ?? "").toLowerCase();
      const altAddr = addr.replace(/:/g, "");
      if (id === target || addr === target || altAddr === target.replace(/:/g, "")) {
        done = true;
        (noble as any).removeListener("discover", onDiscover);
        (noble as any).stopScanning(() => resolve(peripheral));
      }
    };
    (noble as any).on("discover", onDiscover);
    (noble as any).startScanning([SERVICE_UUID_NOBLE], false, () => {});
    setTimeout(() => {
      if (!done) {
        (noble as any).removeListener("discover", onDiscover);
        (noble as any).stopScanning(() => resolve(null));
      }
    }, SCAN_TIMEOUT_MS);
  });
}

export interface BleSession {
  peripheral: Peripheral;
  rx: Characteristic;
  req: Characteristic | null;
  disconnect: () => Promise<void>;
  onDisconnect: (cb: () => void) => void;
  onRefresh: (cb: () => void) => void;
}

export async function connect(addressOrId: string): Promise<BleSession | null> {
  log(`Connecting to ${addressOrId}...`);
  const peripheral = await findPeripheral(addressOrId);
  if (!peripheral) {
    log("Peripheral not found during connect scan");
    return null;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      peripheral.connect((err: Error | null) => (err ? reject(err) : resolve()));
    });
  } catch (e) {
    log(`Connection failed: ${(e as Error).message}`);
    return null;
  }

  log("Connected");

  let rx: Characteristic | null = null;
  let req: Characteristic | null = null;
  try {
    const result: { characteristics: Characteristic[] } = await new Promise((resolve, reject) => {
      peripheral.discoverSomeServicesAndCharacteristics(
        [SERVICE_UUID_NOBLE],
        [RX_CHAR_UUID_NOBLE, REQ_CHAR_UUID_NOBLE],
        (err: Error | null, _services: unknown, characteristics: Characteristic[]) => {
          if (err) reject(err);
          else resolve({ characteristics });
        },
      );
    });
    for (const c of result.characteristics) {
      const u = String(c.uuid).toLowerCase();
      if (u === RX_CHAR_UUID_NOBLE) rx = c;
      else if (u === REQ_CHAR_UUID_NOBLE) req = c;
    }
  } catch (e) {
    log(`Service discovery failed: ${(e as Error).message}`);
    try {
      peripheral.disconnect();
    } catch {}
    return null;
  }

  if (!rx) {
    log("RX characteristic not found");
    try {
      peripheral.disconnect();
    } catch {}
    return null;
  }

  const session: BleSession = {
    peripheral,
    rx,
    req,
    disconnect: () =>
      new Promise<void>((resolve) => {
        try {
          peripheral.disconnect(() => resolve());
        } catch {
          resolve();
        }
      }),
    onDisconnect: (cb) => peripheral.once("disconnect", cb),
    onRefresh: (cb) => {
      if (!req) return;
      req.on("data", () => {
        log("Refresh requested by device");
        cb();
      });
      req.subscribe((err: Error | null) => {
        if (err) log(`Refresh subscription unavailable: ${err.message}`);
      });
    },
  };
  return session;
}

export function writePayload(session: BleSession, payload: object): Promise<boolean> {
  const data = Buffer.from(JSON.stringify(payload));
  log(`Sending: ${data.toString()}`);
  return new Promise<boolean>((resolve) => {
    session.rx.write(data, true, (err: Error | null) => {
      if (err) {
        log(`Write failed: ${err.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
