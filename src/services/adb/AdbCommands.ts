import type { RemoteKey, TextMode } from '@/types/adb';

import { AdbError } from './AdbErrors';

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
export function inputTextCommands(text: string, mode: TextMode): string[] {
  const bad = unsupportedChars(text);
  if (bad.length) {
    throw new AdbError('UNSUPPORTED_TEXT', `Caracteres não suportados pelo "input text" do Android 9: ${bad.join(' ')}`);
  }
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

export function tapCommand(x: number, y: number): string {
  assertInt('x', x, 0, 8192);
  assertInt('y', y, 0, 8192);
  return `input tap ${x} ${y}`;
}

export function swipeCommand(x1: number, y1: number, x2: number, y2: number, durationMs: number): string {
  [x1, y1, x2, y2].forEach((v, i) => assertInt(`p${i}`, v, 0, 8192));
  assertInt('durationMs', durationMs, 1, 5000);
  return `input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`;
}

/** `wm size` output → effective size (override wins, as that is the coordinate space `input tap` uses). */
export function parseWmSize(text: string): { width: number; height: number } | null {
  const m = /Override size: (\d+)x(\d+)/.exec(text) ?? /Physical size: (\d+)x(\d+)/.exec(text);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

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
 * Runs on the projector, detached from the ADB session (setsid), so it fires even with the phone
 * off. Sends Power only if the screen is still awake, so it can never wake a projector in standby.
 */
export function scheduleSleepCommand(minutes: number): string {
  assertInt('minutes', minutes, 1, 600);
  return (
    `${cancelSleepCommand()}; echo $(( $(date +%s) + ${minutes * 60} )) > ${SLEEP_FILE}.at; ` +
    `setsid sh -c 'sleep ${minutes * 60}; dumpsys power | grep -q mWakefulness=Awake && input keyevent 26; rm -f ${SLEEP_FILE}.*' ` +
    `</dev/null >/dev/null 2>&1 & echo $! > ${SLEEP_FILE}.pid`
  );
}

export function cancelSleepCommand(): string {
  // setsid makes the timer its own process group: kill the group so the pending sleep goes too.
  return `[ -f ${SLEEP_FILE}.pid ] && kill -TERM -$(cat ${SLEEP_FILE}.pid) 2>/dev/null; rm -f ${SLEEP_FILE}.*; true`;
}

/** Prints "<due epoch> <now epoch>" when a timer is alive, or just "<now epoch>". */
export const SLEEP_STATUS_COMMAND = `[ -f ${SLEEP_FILE}.pid ] && kill -0 $(cat ${SLEEP_FILE}.pid) 2>/dev/null && printf '%s ' $(cat ${SLEEP_FILE}.at); date +%s`;

/** Opens the Play Store search on the projector; the user installs from there. */
export function storeSearchCommand(query: string): string {
  const q = query.trim();
  if (!q || q.length > 60) throw new AdbError('INVALID_ARGUMENT', 'Informe um nome de app (até 60 caracteres).');
  return `am start -a android.intent.action.VIEW -d ${shellQuote(`market://search?q=${encodeURIComponent(q)}&c=apps`)}`;
}
