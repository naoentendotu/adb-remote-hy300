import {
  parseAppList,
  ANDROID_KEYCODES,
  IR_LINUX_KEYCODES,
  evdevPressCommand,
  inputTextCommands,
  keyEventCommand,
  parseInputDevices,
  shellQuote,
  stripAccents,
} from '@/services/adb/AdbCommands';

/** Reimplementation of Android 9 Input.sendText's "%s" handling, to check what the device would type. */
function android9SendText(arg: string): string {
  const buff = [...arg];
  let escape = false;
  for (let i = 0; i < buff.length; i++) {
    if (escape) {
      escape = false;
      if (buff[i] === 's') {
        buff[i] = ' ';
        buff.splice(--i, 1);
      }
    }
    if (buff[i] === '%') escape = true;
  }
  return buff.join('');
}

/** Minimal POSIX single-quote parser: `input text '<arg>'` → arg. */
function unquote(cmd: string): string {
  const m = /^input text ((?:'[^']*'|\\')+)$/.exec(cmd);
  if (!m) throw new Error(`not a safe input text command: ${cmd}`);
  return m[1].replace(/'([^']*)'|\\'/g, (_, q) => (q === undefined ? "'" : q));
}

/** `… app_process / dev.hy300.helper.Paste <base64>` → pasted text; the argument must be pure base64. */
const PASTE_RE = / app_process \/ dev\.hy300\.helper\.Paste ([A-Za-z0-9+/]+=*)$/;

const typed = (text: string, mode: 'whole' | 'char' = 'whole') =>
  inputTextCommands(text, mode)
    .map((c) => (PASTE_RE.test(c) ? atob(PASTE_RE.exec(c)![1]) : android9SendText(unquote(c))))
    .join('');

describe('key mapping', () => {
  it('uses the documented Android keycodes', () => {
    expect(ANDROID_KEYCODES).toMatchObject({
      up: 19, down: 20, left: 21, right: 22, center: 23, home: 3, back: 4, menu: 82,
      recents: 187, power: 26, volumeUp: 24, volumeDown: 25, mute: 164, del: 67, enter: 66,
    });
    expect(keyEventCommand('home')).toBe('input keyevent 3');
  });

  it('has an IR code for every key except recents', () => {
    const missing = Object.keys(ANDROID_KEYCODES).filter((k) => !(k in IR_LINUX_KEYCODES));
    expect(missing).toEqual(['recents', 'enter']);
  });

  it('encodes one press as four 16-byte input_events', () => {
    const cmd = evdevPressCommand('/dev/input/event0', 103);
    const m = /^print -n '((?:\\0[0-7]{3})+)' > \/dev\/input\/event0$/.exec(cmd);
    expect(m).not.toBeNull();
    const bytes = m![1].split('\\0').slice(1).map((o) => parseInt(o, 8));
    expect(bytes).toHaveLength(64);
    // key down: type=1 code=103 value=1
    expect(bytes.slice(8, 16)).toEqual([1, 0, 103, 0, 1, 0, 0, 0]);
    expect(bytes.slice(16, 32)).toEqual(new Array(16).fill(0));
    // key up
    expect(bytes.slice(40, 48)).toEqual([1, 0, 103, 0, 0, 0, 0, 0]);
  });

  it('refuses arbitrary device paths and codes', () => {
    expect(() => evdevPressCommand('/dev/input/event0; reboot', 103)).toThrow();
    expect(() => evdevPressCommand('/sdcard/x', 103)).toThrow();
    expect(() => evdevPressCommand('/dev/input/event0', 0)).toThrow();
    expect(() => evdevPressCommand('/dev/input/event0', 1.5)).toThrow();
  });
});

describe('inputTextCommands', () => {
  it.each([
    'stranger things',
    'a  b',
    ' lead and trail ',
    '100%',
    '%s literal',
    '50% off',
    'x%%sy',
    "it's",
    `$(reboot) \`id\` ; | & > < * ? ~ " \\ { } [ ] # !`,
  ])('types %p exactly', (text) => {
    expect(typed(text)).toBe(text);
    expect(typed(text, 'char')).toBe(text);
  });

  it('never lets text escape the quoted argument', () => {
    for (const text of ["x'; reboot; echo '", "a'; reboot; echo '"]) {
      for (const cmd of inputTextCommands(text, 'whole')) {
        expect(PASTE_RE.test(cmd) || /^input text (?:'[^']*'|\\')+$/.test(cmd)).toBe(true);
      }
    }
  });

  it('sends one command per character in char mode', () => {
    expect(inputTextCommands('xy z', 'char')).toEqual(["input text 'x'", "input text 'y'", "input text '%s'", "input text 'z'"]);
  });

  it('pastes text with an "a" in one command, as KEYCODE_A opens the firmware voice pop-up', () => {
    for (const mode of ['whole', 'char'] as const) {
      const cmds = inputTextCommands('Abc a', mode);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toMatch(PASTE_RE);
    }
  });

  it('types an "a" normally on the HY320, which has no voice pop-up', () => {
    expect(inputTextCommands('a b', 'whole', false)).toEqual(["input text 'a%sb'"]);
  });

  it('rejects characters Android 9 cannot type, listing them', () => {
    expect(() => inputTextCommands('ação', 'whole')).toThrow(/ç ã/);
    expect(() => inputTextCommands('linha\nnova', 'whole')).toThrow();
    expect(() => inputTextCommands('emoji 🎬', 'whole')).toThrow();
  });

  it('stripAccents gives a typeable fallback for Portuguese', () => {
    const t = stripAccents('Ação, coração e pé');
    expect(t).toBe('Acao, coracao e pe');
    expect(typed(t)).toBe(t);
  });

  it('returns nothing for empty text', () => expect(inputTextCommands('', 'whole')).toEqual([]));
  it('shellQuote escapes single quotes', () => expect(shellQuote("a'b")).toBe(`'a'\\''b'`));
});

describe('parsers', () => {
  it('parses /proc/bus/input/devices', () => {
    const text =
      'I: Bus=0019\nN: Name="ff200010.pwm"\nH: Handlers=event0 dmcfreq keychord cpufreq \n\nI: Bus=0019\nN: Name="ATK8baxx"\nH: Handlers=event2 \n';
    expect(parseInputDevices(text)).toEqual([
      { name: 'ff200010.pwm', path: '/dev/input/event0' },
      { name: 'ATK8baxx', path: '/dev/input/event2' },
    ]);
  });
});

describe('apps / timer / store', () => {
  const { launchAppCommand, forceStopCommand, parseForegroundPackage, scheduleSleepCommand, storeSearchCommand } =
    jest.requireActual('@/services/adb/AdbCommands');
  it('rejects package names that are not package names', () => {
    expect(() => launchAppCommand('org.smarttube.stable; reboot')).toThrow();
    expect(() => forceStopCommand('$(id)')).toThrow();
    expect(forceStopCommand('org.smarttube.stable')).toBe('am force-stop org.smarttube.stable');
  });
  it('parses the resumed activity', () => {
    expect(parseForegroundPackage('mResumedActivity: ActivityRecord{82629e6 u0 com.spocky.projengmenu/.ui.home.MainActivity t71}')).toBe(
      'com.spocky.projengmenu',
    );
    expect(parseForegroundPackage('')).toBeNull();
  });
  it('bounds the sleep timer and keeps the store query quoted', () => {
    expect(() => scheduleSleepCommand(0)).toThrow();
    expect(() => scheduleSleepCommand(1.5)).toThrow();
    expect(storeSearchCommand("vlc'; reboot")).toBe("am start -a android.intent.action.VIEW -d 'market://search?q=vlc'\\''%3B%20reboot&c=apps'");
  });
  it('reads the sleep timer status, with or without the recorded length', () => {
    const { parseSleepStatus } = jest.requireActual('@/services/adb/AdbCommands');
    expect(parseSleepStatus('1000 1800 400\n')).toEqual({ remaining: 600, total: 1800 });
    expect(parseSleepStatus('1000 400')).toEqual({ remaining: 600, total: null });
    expect(parseSleepStatus('400')).toBeNull();
    expect(parseSleepStatus('300 1800 400')).toBeNull();
  });
  it('confirms the power-off prompt with OK, only while the screen is awake', () => {
    const { POWER_OFF_COMMAND } = jest.requireActual('@/services/adb/AdbCommands');
    const confirm = 'input keyevent 26; sleep 2; dumpsys power | grep -q mWakefulness=Awake && input keyevent 23';
    expect(POWER_OFF_COMMAND).toBe(`setsid sh -c '${confirm}' </dev/null >/dev/null 2>&1 &`);
    expect(scheduleSleepCommand(30)).toMatch(/sleep 1800; dumpsys power \| grep -q mWakefulness=Awake && \{ a=\$\(.*am force-stop \$a; /);
    expect(scheduleSleepCommand(30)).toContain(`am force-stop $a; ${confirm}; };`);
  });
});

describe('parseAppList', () => {
  it('parses AppLister lines, drops malformed ones and sorts by name', () => {
    const out = 'org.smarttube.stable\tSmartTube\tiVBORw0K\r\nbad line\ncom.disney.disneyplus\tDisney+\tAAA=\nx.y\tEvil\t$(reboot)\n';
    expect(parseAppList(out)).toEqual([
      { pkg: 'com.disney.disneyplus', label: 'Disney+', icon: 'data:image/png;base64,AAA=' },
      { pkg: 'org.smarttube.stable', label: 'SmartTube', icon: 'data:image/png;base64,iVBORw0K' },
    ]);
  });
});
