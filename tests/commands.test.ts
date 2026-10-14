import {
  ANDROID_KEYCODES,
  IR_LINUX_KEYCODES,
  evdevPressCommand,
  inputTextCommands,
  keyEventCommand,
  parseInputDevices,
  parseWmSize,
  shellQuote,
  stripAccents,
  swipeCommand,
  tapCommand,
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

const typed = (text: string, mode: 'whole' | 'char' = 'whole') =>
  inputTextCommands(text, mode).map((c) => android9SendText(unquote(c))).join('');

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
    for (const cmd of inputTextCommands("a'; reboot; echo '", 'whole')) {
      expect(cmd).toMatch(/^input text (?:'[^']*'|\\')+$/);
    }
  });

  it('sends one command per character in char mode', () => {
    expect(inputTextCommands('ab c', 'char')).toEqual(["input text 'a'", "input text 'b'", "input text '%s'", "input text 'c'"]);
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

describe('tap / swipe', () => {
  it('builds integer-only commands', () => {
    expect(tapCommand(640, 360)).toBe('input tap 640 360');
    expect(swipeCommand(0, 0, 100, 200, 300)).toBe('input swipe 0 0 100 200 300');
  });
  it.each([[NaN, 1], [1.5, 1], [-1, 1], [1, 99999]])('rejects %p,%p', (x, y) => expect(() => tapCommand(x, y)).toThrow());
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
  it('prefers the override size from wm size', () => {
    expect(parseWmSize('Physical size: 1024x600\nOverride size: 1280x720')).toEqual({ width: 1280, height: 720 });
    expect(parseWmSize('Physical size: 1920x1080')).toEqual({ width: 1920, height: 1080 });
    expect(parseWmSize('')).toBeNull();
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
});
