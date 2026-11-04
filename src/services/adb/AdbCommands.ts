import type { InstalledApp, RemoteKey, TextMode } from '@/types/adb';

import { AdbError } from './AdbErrors';
import { HELPER_DEX } from './helperDex';

/** android.view.KeyEvent codes, used by the `input keyevent` path. */
export const ANDROID_KEYCODES: Record<RemoteKey, number> = {
  up: 19, // KEYCODE_DPAD_UP
  down: 20, // KEYCODE_DPAD_DOWN
  left: 21, // KEYCODE_DPAD_LEFT
  right: 22, // KEYCODE_DPAD_RIGHT
  center: 23, // KEYCODE_DPAD_CENTER
  home: 3, // KEYCODE_HOME
  back: 4, // KEYCODE_BACK
  menu: 82, // KEYCODE_MENU
  recents: 187, // KEYCODE_APP_SWITCH
  power: 26, // KEYCODE_POWER
  volumeUp: 24, // KEYCODE_VOLUME_UP
  volumeDown: 25, // KEYCODE_VOLUME_DOWN
  mute: 164, // KEYCODE_VOLUME_MUTE (KEYCODE_MUTE=91 is the microphone mute)
  del: 67, // KEYCODE_DEL (backspace)
  enter: 66, // KEYCODE_ENTER
};

/** evdev device of the HY300 IR receiver, as named in /proc/bus/input/devices. */
export const IR_DEVICE_NAME = 'ff200010.pwm';

/**
 * Linux input codes that the HY300 IR receiver advertises (getevent -p) and that its key layout
 * (/system/usr/keylayout/ff200010_pwm.kl) maps to the Android key in the comment.
 * Writing these to the evdev node takes ~10–40 ms vs ~1.2 s for `input keyevent` on this SoC.
 */
export const IR_LINUX_KEYCODES: Partial<Record<RemoteKey, number>> = {
  up: 103, // DPAD_UP
  down: 108, // DPAD_DOWN
  left: 105, // DPAD_LEFT
  right: 106, // DPAD_RIGHT
  center: 232, // DPAD_CENTER (KEY_REPLY; KEY_ENTER is mapped to SETTINGS on this device)
  home: 102, // HOME
  back: 158, // BACK
  menu: 139, // MENU
  power: 116, // POWER
  volumeUp: 115, // VOLUME_UP
  volumeDown: 114, // VOLUME_DOWN
  mute: 113, // VOLUME_MUTE
  del: 65, // DEL (KEY_F7)
};

export function keyEventCommand(key: RemoteKey, long = false): string {
  return `input keyevent ${long ? '--longpress ' : ''}${ANDROID_KEYCODES[key]}`;
}

/** One full press (down, SYN, up, SYN) written as 32-bit `struct input_event`s with the shell builtin `print`. */
export function evdevPressCommand(devicePath: string, linuxCode: number): string {
  const { write, down, up } = evdevEvents(devicePath, linuxCode);
  return write([...down, ...up]);
}

/** Key held down for 1 s on the device itself, so Android sees a real long press. */
export function evdevLongPressCommand(devicePath: string, linuxCode: number): string {
  const { write, down, up } = evdevEvents(devicePath, linuxCode);
  return `${write(down)}; sleep 1; ${write(up)}`;
}

function evdevEvents(devicePath: string, linuxCode: number) {
  if (!/^\/dev\/input\/event\d{1,3}$/.test(devicePath)) throw new AdbError('INVALID_ARGUMENT', `device ${devicePath}`);
  if (!Number.isInteger(linuxCode) || linuxCode < 1 || linuxCode > 0x2ff) {
    throw new AdbError('INVALID_ARGUMENT', `code ${linuxCode}`);
  }
  const event = (type: number, code: number, value: number) => [
    0, 0, 0, 0, 0, 0, 0, 0, // timeval: the kernel stamps the event itself
    type & 0xff, type >> 8,
    code & 0xff, code >> 8,
    value & 0xff, 0, 0, 0,
  ];
  const write = (bytes: number[]) =>
    `print -n '${bytes.map((b) => '\\0' + b.toString(8).padStart(3, '0')).join('')}' > ${devicePath}`;
  return {
    write,
    down: [...event(1, linuxCode, 1), ...event(0, 0, 0)],
    up: [...event(1, linuxCode, 0), ...event(0, 0, 0)],
  };
}

/** Parses /proc/bus/input/devices into name → /dev/input/eventN. */
export function parseInputDevices(text: string): { name: string; path: string }[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const name = /^N: Name="([^"]*)"/m.exec(block)?.[1];
      const handler = /^H: Handlers=.*\b(event\d+)\b/m.exec(block)?.[1];
      return name !== undefined && handler ? { name, path: `/dev/input/${handler}` } : null;
    })
    .filter((d): d is { name: string; path: string } => d !== null);
}

export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Characters `input text` cannot type on Android 9 (it only maps printable ASCII through the virtual keyboard). */
export function unsupportedChars(text: string): string[] {
  return [...new Set([...text].filter((c) => c < ' ' || c > '~'))];
}

/**
 * Builds `input text` commands. Android 9's Input.sendText turns "%s" into a space and has no escape
 * for a literal "%s", so spaces are encoded as %s and a literal '%' followed by 's' is split across
 * two commands. Every chunk is single-quoted, so nothing in the text reaches the shell as syntax.
 */
export function inputTextCommands(text: string, mode: TextMode, pasteA = true): string[] {
  const bad = unsupportedChars(text);
  if (bad.length) {
    throw new AdbError('UNSUPPORTED_TEXT', `Caracteres não suportados pelo "input text" do Android 9: ${bad.join(' ')}`);
  }
  // HY300 firmware turns KEYCODE_A into its "voice remote" pop-up, which steals focus mid-text: paste instead.
  // The HY320 does not, so it types normally. Text is printable ASCII here, so btoa works; base64 is shell-safe unquoted.
  if (pasteA && /a/i.test(text)) return [helperCommand('Paste', btoa(text))];
  const chunks: string[] = [];
  let cur = '';
  for (const c of text) {
    if ((mode === 'char' && cur) || (c === 's' && cur.endsWith('%'))) {
      chunks.push(cur);
      cur = '';
    }
    cur += c === ' ' ? '%s' : c;
  }
  if (cur) chunks.push(cur);
  return chunks.map((chunk) => `input text ${shellQuote(chunk)}`);
}

const assertInt = (name: string, v: number, min: number, max: number) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new AdbError('INVALID_ARGUMENT', `${name}=${v}`);
};

const PACKAGE_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

const assertPackage = (pkg: string) => {
  if (!PACKAGE_RE.test(pkg)) throw new AdbError('INVALID_ARGUMENT', `pacote ${pkg}`);
};

/** Resolves the TV (or phone) launcher activity at run time, so app updates that rename it keep working. */
export function launchAppCommand(pkg: string): string {
  assertPackage(pkg);
  const resolve = (cat: string) => `cmd package resolve-activity --brief -c android.intent.category.${cat} ${pkg} | tail -n 1`;
  return `c=$(${resolve('LEANBACK_LAUNCHER')}); case "$c" in */*) ;; *) c=$(${resolve('LAUNCHER')}) ;; esac; am start -n "$c"`;
}

export const FOREGROUND_COMMAND = 'dumpsys activity activities | grep mResumedActivity';

/** `mResumedActivity: ActivityRecord{82629e6 u0 com.pkg/.Main t71}` → com.pkg */
export function parseForegroundPackage(text: string): string | null {
  const pkg = / u\d+ ([\w.]+)\//.exec(text)?.[1] ?? null;
  return pkg && PACKAGE_RE.test(pkg) ? pkg : null;
}

export function forceStopCommand(pkg: string): string {
  assertPackage(pkg);
  return `am force-stop ${pkg}`;
}

const SLEEP_FILE = '/data/local/tmp/remote-adb-sleep';

/**
 * Power, then OK on the HY300's "power off?" prompt, which only exists while the screen is still awake.
 * Retries the OK while the screen stays awake, in case the first one landed before the prompt was up.
 */
const POWER_OFF =
  'input keyevent 26; sleep 2; for i in 1 2 3; do dumpsys power | grep -q mWakefulness=Awake || break; input keyevent 23; sleep 2; done';

/**
 * Home, then force-stop the app that was on screen unless Home brought it back (it is the launcher).
 * A foreground app (video player) kept the power-off prompt from taking the OK; this also leaves nothing running.
 */
const CLOSE_FOREGROUND =
  'a=$(dumpsys activity activities | grep mResumedActivity | sed "s/.* u[0-9]* \\([^/]*\\)\\/.*/\\1/"); input keyevent 3; sleep 1; ' +
  '[ -n "$a" ] && ! dumpsys activity activities | grep mResumedActivity | grep -q " $a/" && am force-stop $a';

/** Detached (setsid) so it finishes even when the ADB session drops as the projector goes down. */
export const POWER_OFF_COMMAND = `setsid sh -c '${POWER_OFF}' </dev/null >/dev/null 2>&1 &`;

/**
 * Runs on the projector, detached from the ADB session (setsid), so it fires even with the phone
 * off. Powers off only if the screen is still awake, so it can never wake a projector in standby.
 */
export function scheduleSleepCommand(minutes: number): string {
  assertInt('minutes', minutes, 1, 600);
  return (
    `${cancelSleepCommand()}; echo $(( $(date +%s) + ${minutes * 60} )) ${minutes * 60} > ${SLEEP_FILE}.at; ` +
    `setsid sh -c 'sleep ${minutes * 60}; dumpsys power | grep -q mWakefulness=Awake && { ${CLOSE_FOREGROUND}; ${POWER_OFF}; }; rm -f ${SLEEP_FILE}.*' ` +
    `</dev/null >/dev/null 2>&1 & echo $! > ${SLEEP_FILE}.pid`
  );
}

export function cancelSleepCommand(): string {
  // setsid makes the timer its own process group: kill the group so the pending sleep goes too.
  return `[ -f ${SLEEP_FILE}.pid ] && kill -TERM -$(cat ${SLEEP_FILE}.pid) 2>/dev/null; rm -f ${SLEEP_FILE}.*; true`;
}

/** Prints "<due epoch> <total s> <now epoch>" when a timer is alive, or just "<now epoch>". */
export const SLEEP_STATUS_COMMAND = `[ -f ${SLEEP_FILE}.pid ] && kill -0 $(cat ${SLEEP_FILE}.pid) 2>/dev/null && printf '%s ' $(cat ${SLEEP_FILE}.at); date +%s`;

export interface SleepStatus {
  remaining: number;
  /** Timer length in seconds; null for a timer set by an older version that did not record it. */
  total: number | null;
}

/** Reads SLEEP_STATUS_COMMAND output. Uses the projector's own clock on both ends, so phone clock skew does not matter. */
export function parseSleepStatus(stdout: string): SleepStatus | null {
  const n = stdout.trim().split(/\s+/).map(Number);
  const now = n[n.length - 1];
  const due = n[0];
  if (n.length < 2 || !(due > now)) return null;
  return { remaining: due - now, total: n.length === 3 ? n[1] : null };
}

/** Opens the Play Store search on the projector; the user installs from there. */
export function storeSearchCommand(query: string): string {
  const q = query.trim();
  if (!q || q.length > 60) throw new AdbError('INVALID_ARGUMENT', 'Informe um nome de app (até 60 caracteres).');
  return `am start -a android.intent.action.VIEW -d ${shellQuote(`market://search?q=${encodeURIComponent(q)}&c=apps`)}`;
}

const HELPER_PATH = '/data/local/tmp/hy300-helper.dex';

/** Writes the bundled helper dex (tools/projector-helper; rewritten each time so a stale copy never runs) and runs one of its classes. */
const helperCommand = (cls: 'AppLister' | 'Paste', arg = '') =>
  `echo ${HELPER_DEX} | base64 -d > ${HELPER_PATH} && CLASSPATH=${HELPER_PATH} app_process / dev.hy300.helper.${cls} ${arg}`;

export const LIST_APPS_COMMAND = helperCommand('AppLister');

/** AppLister lines `pkg\tlabel\tbase64png` → apps sorted by name; malformed lines are dropped. */
export function parseAppList(text: string): InstalledApp[] {
  return text
    .split('\n')
    .map((line) => line.trim().split('\t'))
    .filter(([pkg = '', , icon = '']) => PACKAGE_RE.test(pkg) && /^[A-Za-z0-9+/]+=*$/.test(icon))
    .map(([pkg, label, icon]) => ({ pkg, label: label || pkg, icon: `data:image/png;base64,${icon}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const MOUSE_FIFO = '/data/local/tmp/projex-mouse';

/** HID boot-style mouse: 3 buttons, then relative X, Y and wheel as signed bytes (-127..127). */
const MOUSE_DESCRIPTOR = [
  0x05, 0x01, 0x09, 0x02, 0xa1, 0x01, 0x09, 0x01, 0xa1, 0x00, 0x05, 0x09, 0x19, 0x01, 0x29, 0x03, 0x15, 0x00, 0x25, 0x01,
  0x95, 0x03, 0x75, 0x01, 0x81, 0x02, 0x95, 0x01, 0x75, 0x05, 0x81, 0x03, 0x05, 0x01, 0x09, 0x30, 0x09, 0x31, 0x09, 0x38,
  0x15, 0x81, 0x25, 0x7f, 0x75, 0x08, 0x95, 0x03, 0x81, 0x06, 0xc0, 0xc0,
];

const MOUSE_REGISTER = JSON.stringify({ id: 1, command: 'register', name: 'Projex Mouse', vid: 0x1234, pid: 0x5678, descriptor: MOUSE_DESCRIPTOR });

/**
 * Registers a virtual USB mouse through Android's own `hid` tool (/dev/uhid; the adb shell is in the uhid group,
 * no root needed), so the projector shows a real cursor. `hid` reads JSON commands from a FIFO; a sleeping writer
 * keeps the FIFO open so `hid` never sees EOF between our writes. Idempotent: does nothing while it is running.
 */
export const START_MOUSE_COMMAND =
  `F=${MOUSE_FIFO}; if ! { [ -f $F.pid ] && kill -0 $(cat $F.pid) 2>/dev/null; }; then ` +
  `rm -f $F; mkfifo $F; ` +
  `setsid sh -c "sleep 2147483647 > $F" </dev/null >/dev/null 2>&1 & echo $! > $F.hold; ` +
  `setsid hid $F </dev/null >/dev/null 2>&1 & echo $! > $F.pid; ` +
  `sleep 0.5; echo ${shellQuote(MOUSE_REGISTER)} > $F; sleep 0.3; fi`;

/** Removes the virtual mouse: killing the writer closes the FIFO, which ends `hid` and unregisters the device. */
export const STOP_MOUSE_COMMAND = `F=${MOUSE_FIFO}; for p in $F.hold $F.pid; do [ -f $p ] && kill $(cat $p) 2>/dev/null; done; rm -f $F $F.hold $F.pid; true`;

export const MOUSE_LEFT = 1;
export const MOUSE_RIGHT = 2;

/** Relative motion as HID reports [buttons, dx, dy, wheel]; long moves are split into ±127 steps. */
export function mouseReports(dx: number, dy: number, wheel = 0, buttons = 0): number[][] {
  [dx, dy, wheel, buttons].forEach((v, i) => assertInt(`m${i}`, v, -100_000, 100_000));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(wheel)) / 127));
  const out: number[][] = [];
  let sx = 0, sy = 0, sw = 0;
  for (let i = 1; i <= steps; i++) {
    const nx = Math.round((dx * i) / steps), ny = Math.round((dy * i) / steps), nw = Math.round((wheel * i) / steps);
    out.push([buttons, nx - sx, ny - sy, nw - sw]);
    [sx, sy, sw] = [nx, ny, nw];
  }
  return out;
}

/** Writes reports to the running `hid`; skipped if it died, since opening a reader-less FIFO would block the shell. */
export function mouseReportCommand(reports: number[][]): string {
  const lines = reports.map((r) => {
    if (r.length !== 4) throw new AdbError('INVALID_ARGUMENT', 'relatório de mouse');
    r.forEach((v, i) => assertInt(`r${i}`, v, i === 0 ? 0 : -127, i === 0 ? 7 : 127));
    // HID wants signed bytes as 0..255.
    return JSON.stringify({ id: 1, command: 'report', report: r.map((v) => v & 0xff) });
  });
  return `F=${MOUSE_FIFO}; [ -f $F.pid ] && kill -0 $(cat $F.pid) 2>/dev/null && printf '%s\n' ${lines.map(shellQuote).join(' ')} > $F`;
}
